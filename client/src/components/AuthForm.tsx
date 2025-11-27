import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Alert, AlertDescription } from "./ui/alert";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";

type AuthFormProps = {
  onSuccess?: () => void;
};

export function AuthForm({ onSuccess }: AuthFormProps) {
  // Login state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  const [error, setError] = useState<string | null>(null);

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: () => {
      setError(null);
      if (onSuccess) {
        onSuccess();
      } else {
        window.location.reload();
      }
    },
    onError: (err) => {
      console.error("Login error:", err);
      setError(err.message || "Login failed");
    },
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!email || !password) {
      setError("Please fill in all fields");
      return;
    }

    console.log("Logging in with:", { email, password: "***" });
    
    loginMutation.mutate({
      email: email.trim(),
      password: password,
    });
  };

  const isLoading = loginMutation.isPending;

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Sign In</CardTitle>
        <CardDescription>
          Enter your credentials to access the admin panel
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="admin@admin.local"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              autoComplete="email"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              autoComplete="current-password"
              required
            />
          </div>
          
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sign In
          </Button>
        </form>
        
        <div className="mt-4 text-center text-sm text-muted-foreground">
          <p>Default credentials:</p>
          <p className="font-mono text-xs">admin@admin.local / admin123</p>
        </div>
      </CardContent>
    </Card>
  );
}

