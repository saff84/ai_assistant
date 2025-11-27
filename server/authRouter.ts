import { publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import * as db from "./db";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import crypto from "crypto";

// Helper function to hash passwords
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Helper function to verify password
function verifyPassword(password: string, hash: string): boolean {
  const inputHash = hashPassword(password);
  return inputHash === hash;
}

export const authRouter = router({
  // Get current user info
  me: publicProcedure.query(opts => opts.ctx.user),

  // Logout
  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return {
      success: true,
    } as const;
  }),

  // Quick dev login (no credentials needed in dev mode)
  devLogin: publicProcedure.mutation(async ({ ctx }) => {
    if (!ENV.devMode) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Dev login is only available in development mode"
      });
    }

    const openId = "dev-admin";
    const name = ENV.devAdminName || "Admin";
    const email = ENV.devAdminEmail || "admin@localhost";

    // Create or update user
    await db.upsertUser({
      openId,
      name,
      email,
      loginMethod: "dev",
      role: "admin",
      lastSignedIn: new Date(),
    });

    // Create session token
    const appId = ENV.appId || "local-app";
    const sessionToken = await sdk.signSession({
      openId,
      appId,
      name,
    }, {
      expiresInMs: ONE_YEAR_MS,
    });

    // Set cookie
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.cookie(COOKIE_NAME, sessionToken, {
      ...cookieOptions,
      maxAge: ONE_YEAR_MS
    });

    return {
      success: true,
      user: {
        openId,
        name,
        email,
        role: "admin" as const,
      }
    };
  }),

  // List all users (admin only)
  listUsers: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only admins can list users"
      });
    }

    const users = await db.getAllUsers();
    return users.map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      createdAt: u.createdAt,
      lastSignedIn: u.lastSignedIn,
    }));
  }),

  // Create new user (admin only)
  createUser: publicProcedure
    .input(z.object({
      email: z.string().email("Invalid email address"),
      password: z.string().min(6, "Password must be at least 6 characters"),
      name: z.string().min(2, "Name must be at least 2 characters"),
      role: z.enum(["user", "admin"]).default("user"),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user || ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can create users"
        });
      }

      // Check if user already exists
      const existingUser = await db.getUserByEmail(input.email);
      if (existingUser) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "User with this email already exists"
        });
      }

      // Create user with hashed password
      const openId = `user-${crypto.randomUUID()}`;
      const passwordHash = hashPassword(input.password);

      await db.createUserWithPassword({
        openId,
        email: input.email,
        name: input.name,
        passwordHash,
        loginMethod: "email",
        role: input.role,
        lastSignedIn: new Date(),
      });

      return {
        success: true,
        message: "User created successfully",
      };
    }),

  // Delete user (admin only)
  deleteUser: publicProcedure
    .input(z.object({
      userId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user || ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can delete users"
        });
      }

      // Prevent deleting yourself
      if (ctx.user.id === input.userId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot delete your own account"
        });
      }

      await db.deleteUserById(input.userId);

      return {
        success: true,
        message: "User deleted successfully",
      };
    }),

  // Update user password (admin only)
  updateUserPassword: publicProcedure
    .input(z.object({
      userId: z.number(),
      newPassword: z.string().min(6, "Password must be at least 6 characters"),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user || ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can update user passwords"
        });
      }

      const passwordHash = hashPassword(input.newPassword);
      await db.updateUserPassword(input.userId, passwordHash);

      return {
        success: true,
        message: "Password updated successfully",
      };
    }),

  // Login with email/password
  login: publicProcedure
    .input(z.object({
      email: z.string().email("Invalid email address"),
      password: z.string().min(1, "Password is required"),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get user by email
      const user = await db.getUserByEmail(input.email);
      
      if (!user || !user.passwordHash) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password"
        });
      }

      // Verify password
      if (!verifyPassword(input.password, user.passwordHash)) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password"
        });
      }

      // Update last signed in
      await db.upsertUser({
        openId: user.openId,
        lastSignedIn: new Date(),
      });

      // Create session token
      const appId = ENV.appId || "local-app";
      const sessionToken = await sdk.signSession({
        openId: user.openId,
        appId,
        name: user.name || user.email || "User",
      }, {
        expiresInMs: ONE_YEAR_MS,
      });

      // Set cookie
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS
      });

      return {
        success: true,
        user: {
          openId: user.openId,
          name: user.name || user.email,
          email: user.email,
          role: user.role,
        }
      };
    }),
});

