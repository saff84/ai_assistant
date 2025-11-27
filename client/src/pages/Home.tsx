import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthForm } from "@/components/AuthForm";
import { getLoginUrl } from "@/const";
import { Link } from "wouter";
import { FileText, MessageSquare, Settings, BarChart3, Zap, Users } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function Home() {
  const { user, isAuthenticated, logout } = useAuth();
  const devLoginMutation = trpc.auth.devLogin.useMutation({
    onSuccess: () => {
      window.location.reload();
    },
  });

  const loginUrl = getLoginUrl();
  const isDevMode = loginUrl === "#";

  const handleDevLogin = () => {
    devLoginMutation.mutate();
  };

  if (isAuthenticated && user?.role === "admin") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
        <div className="container mx-auto px-4 py-12">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">AI Knowledge Assistant</h1>
            <p className="text-lg text-muted-foreground">
              Manage your knowledge base and configure the AI assistant
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-12">
            {/* Documents */}
            <Link href="/documents">
              <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-500" />
                    <CardTitle>Documents</CardTitle>
                  </div>
                  <CardDescription>Manage your knowledge base</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Upload, organize, and manage PDF, Excel, and Word documents
                  </p>
                </CardContent>
              </Card>
            </Link>

            {/* Prompt Editor */}
            <Link href="/prompt-editor">
              <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Settings className="w-5 h-5 text-green-500" />
                    <CardTitle>Prompt Editor</CardTitle>
                  </div>
                  <CardDescription>Configure assistant behavior</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Customize the system prompt to define assistant personality
                  </p>
                </CardContent>
              </Card>
            </Link>

            {/* Test Panel */}
            <Link href="/test-panel">
              <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-purple-500" />
                    <CardTitle>Test Panel</CardTitle>
                  </div>
                  <CardDescription>Test the assistant</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Chat with the assistant and verify responses before deployment
                  </p>
                </CardContent>
              </Card>
            </Link>

            {/* Statistics */}
            <Link href="/statistics">
              <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-orange-500" />
                    <CardTitle>Statistics</CardTitle>
                  </div>
                  <CardDescription>Monitor performance</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    View usage statistics, popular questions, and performance metrics
                  </p>
                </CardContent>
              </Card>
            </Link>

            {/* User Management */}
            <Link href="/users">
              <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-cyan-500" />
                    <CardTitle>Users</CardTitle>
                  </div>
                  <CardDescription>Manage users</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Create, edit, and manage user accounts and permissions
                  </p>
                </CardContent>
              </Card>
            </Link>
          </div>

          {/* Features */}
          <div className="bg-card border rounded-lg p-8 mb-8">
            <h2 className="text-2xl font-bold mb-6">Features</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex gap-3">
                <Zap className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-1" />
                <div>
                  <p className="font-medium">RAG-Powered Responses</p>
                  <p className="text-sm text-muted-foreground">
                    Answers based on your knowledge base documents
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <FileText className="w-5 h-5 text-blue-500 flex-shrink-0 mt-1" />
                <div>
                  <p className="font-medium">Multi-Format Support</p>
                  <p className="text-sm text-muted-foreground">
                    PDF, Excel, Word documents supported
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <MessageSquare className="w-5 h-5 text-purple-500 flex-shrink-0 mt-1" />
                <div>
                  <p className="font-medium">Multiple Integrations</p>
                  <p className="text-sm text-muted-foreground">
                    Website chat and Bitrix24 integration
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <BarChart3 className="w-5 h-5 text-orange-500 flex-shrink-0 mt-1" />
                <div>
                  <p className="font-medium">Detailed Analytics</p>
                  <p className="text-sm text-muted-foreground">
                    Track usage, performance, and popular questions
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <Button onClick={logout} variant="outline">
              Logout
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4">AI Knowledge Assistant</h1>
          <p className="text-lg text-muted-foreground">
            Intelligent document-based Q&A system with Bitrix24 integration
          </p>
        </div>
        
        <div className="flex flex-col items-center gap-6">
          <AuthForm />
          
          {isDevMode && (
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">Development Mode</p>
              <Button 
                onClick={handleDevLogin} 
                variant="outline"
                disabled={devLoginMutation.isPending}
              >
                {devLoginMutation.isPending ? "Logging in..." : "Quick Dev Login (Admin)"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
