import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { trpc } from "@/lib/trpc";
import { UserPlus, Trash2, Key } from "lucide-react";
import { format } from "date-fns";

export default function UsersPage() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  
  // Form state
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<"user" | "admin">("user");
  const [newPassword, setNewPassword] = useState("");
  
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const utils = trpc.useUtils();
  
  const { data: users, isLoading } = trpc.auth.listUsers.useQuery();

  const createUserMutation = trpc.auth.createUser.useMutation({
    onSuccess: () => {
      setSuccess("User created successfully!");
      setError(null);
      setIsCreateDialogOpen(false);
      setNewUserEmail("");
      setNewUserName("");
      setNewUserPassword("");
      setNewUserRole("user");
      utils.auth.listUsers.invalidate();
      setTimeout(() => setSuccess(null), 3000);
    },
    onError: (err) => {
      setError(err.message);
      setSuccess(null);
    },
  });

  const deleteUserMutation = trpc.auth.deleteUser.useMutation({
    onSuccess: () => {
      setSuccess("User deleted successfully!");
      setError(null);
      utils.auth.listUsers.invalidate();
      setTimeout(() => setSuccess(null), 3000);
    },
    onError: (err) => {
      setError(err.message);
      setSuccess(null);
    },
  });

  const updatePasswordMutation = trpc.auth.updateUserPassword.useMutation({
    onSuccess: () => {
      setSuccess("Password updated successfully!");
      setError(null);
      setIsPasswordDialogOpen(false);
      setNewPassword("");
      setSelectedUserId(null);
      setTimeout(() => setSuccess(null), 3000);
    },
    onError: (err) => {
      setError(err.message);
      setSuccess(null);
    },
  });

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!newUserEmail || !newUserName || !newUserPassword) {
      setError("Please fill in all fields");
      return;
    }

    createUserMutation.mutate({
      email: newUserEmail,
      name: newUserName,
      password: newUserPassword,
      role: newUserRole,
    });
  };

  const handleDeleteUser = (userId: number) => {
    if (confirm("Are you sure you want to delete this user?")) {
      deleteUserMutation.mutate({ userId });
    }
  };

  const handleUpdatePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!selectedUserId || !newPassword) {
      setError("Please provide a new password");
      return;
    }

    updatePasswordMutation.mutate({
      userId: selectedUserId,
      newPassword,
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">User Management</h1>
            <p className="text-muted-foreground">
              Manage user accounts and permissions
            </p>
          </div>
          
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="mr-2 h-4 w-4" />
                Create User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New User</DialogTitle>
                <DialogDescription>
                  Add a new user account with email and password
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateUser}>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="create-name">Full Name</Label>
                    <Input
                      id="create-name"
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      placeholder="John Doe"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="create-email">Email</Label>
                    <Input
                      id="create-email"
                      type="email"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      placeholder="user@example.com"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="create-password">Password</Label>
                    <Input
                      id="create-password"
                      type="password"
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="create-role">Role</Label>
                    <Select value={newUserRole} onValueChange={(v: "user" | "admin") => setNewUserRole(v)}>
                      <SelectTrigger id="create-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                </div>
                
                <DialogFooter className="mt-6">
                  <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createUserMutation.isPending}>
                    {createUserMutation.isPending ? "Creating..." : "Create User"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {success && (
          <Alert className="bg-green-50 border-green-200">
            <AlertDescription className="text-green-800">{success}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>All Users</CardTitle>
            <CardDescription>
              {users?.length || 0} total users
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading users...</div>
            ) : users && users.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                          {user.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(user.createdAt), "MMM dd, yyyy")}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(user.lastSignedIn), "MMM dd, yyyy HH:mm")}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedUserId(user.id);
                              setIsPasswordDialogOpen(true);
                              setNewPassword("");
                            }}
                          >
                            <Key className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteUser(user.id)}
                            disabled={deleteUserMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No users found
              </div>
            )}
          </CardContent>
        </Card>

        {/* Change Password Dialog */}
        <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Change User Password</DialogTitle>
              <DialogDescription>
                Enter a new password for this user
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleUpdatePassword}>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                </div>
                
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </div>
              
              <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onClick={() => {
                  setIsPasswordDialogOpen(false);
                  setNewPassword("");
                  setSelectedUserId(null);
                }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updatePasswordMutation.isPending}>
                  {updatePasswordMutation.isPending ? "Updating..." : "Update Password"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

