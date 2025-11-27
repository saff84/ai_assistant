import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Send, X, MessageCircle } from "lucide-react";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";

interface Message {
  id: string;
  type: "user" | "assistant";
  content: string;
}

export interface WebChatWidgetProps {
  title?: string;
  subtitle?: string;
  position?: "bottom-right" | "bottom-left";
}

/**
 * Web Chat Widget Component
 * Can be embedded on any website to provide AI assistant chat
 */
type ProcessingStage = "idle" | "search" | "think" | "type";
const stageOrder: ProcessingStage[] = ["search", "think", "type"];
const stageLabels: Record<Exclude<ProcessingStage, "idle">, string> = {
  search: "Ищу информацию",
  think: "Думаю",
  type: "Печатаю",
};
const stageLabel = (stage: ProcessingStage) => {
  switch (stage) {
    case "search":
      return stageLabels.search;
    case "think":
      return stageLabels.think;
    case "type":
      return stageLabels.type;
    default:
      return stageLabels.think;
  }
};

export function WebChatWidget({
  title = "AI Assistant",
  subtitle = "Ask me anything",
  position = "bottom-right",
}: WebChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sessionId] = useState(() => `session-${Date.now()}-${Math.random()}`);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [processingStage, setProcessingStage] = useState<ProcessingStage>("idle");
  const stageTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  // Ask assistant mutation
  const askMutation = trpc.document.askAssistant.useMutation({
    onSuccess: (response) => {
      setProcessingStage("type");
      setTimeout(() => setProcessingStage("idle"), 400);
      const assistantMessage: Message = {
        id: `msg-${Date.now()}`,
        type: "assistant",
        content: response.response,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    },
    onError: () => {
      setProcessingStage("idle");
    },
  });

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(
    () => () => {
      stageTimers.current.forEach((timer) => clearTimeout(timer));
    },
    []
  );

  const handleSendMessage = () => {
    if (!input.trim() || processingStage !== "idle") return;

    // Add user message
    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      type: "user",
      content: input,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    // Send to assistant
    setProcessingStage("search");
    stageTimers.current.forEach((timer) => clearTimeout(timer));
    stageTimers.current = [
      setTimeout(() => {
        setProcessingStage((prev) => (prev === "search" ? "think" : prev));
      }, 2000),
      setTimeout(() => {
        setProcessingStage((prev) =>
          stageOrder.indexOf(prev) < stageOrder.indexOf("type") ? "type" : prev
        );
      }, 3500),
    ];
    askMutation.mutate(
      {
        query: input,
        sessionId,
        source: "website",
      },
      {
        onSettled: () => {
          stageTimers.current.forEach((timer) => clearTimeout(timer));
          stageTimers.current = [];
        },
      }
    );
  };

  const positionClasses = position === "bottom-right" ? "bottom-4 right-4" : "bottom-4 left-4";

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed ${positionClasses} z-50 p-4 bg-primary text-primary-foreground rounded-full shadow-lg hover:shadow-xl transition-shadow`}
        aria-label="Open chat"
      >
        <MessageCircle className="w-6 h-6" />
      </button>
    );
  }

  return (
    <div
      className={`fixed ${positionClasses} z-50 w-96 h-96 bg-background border rounded-lg shadow-xl flex flex-col`}
    >
      {/* Header */}
      <div className="bg-primary text-primary-foreground p-4 rounded-t-lg flex justify-between items-center">
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-xs opacity-90">{subtitle}</p>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="hover:bg-primary-foreground/20 p-1 rounded transition"
          aria-label="Close chat"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {processingStage !== "idle" && (
        <div className="px-4 py-1 border-b">
          <ProcessingTimeline stage={processingStage} />
        </div>
      )}
        {askMutation.isPending && (
          <div className="flex justify-start">
            <div className="w-full px-3 py-2 rounded-lg bg-muted text-foreground">
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>
                  {stageLabel(
                    processingStage === "idle" ? "think" : processingStage
                  )}
                </span>
              </div>
            </div>
          </div>
        )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            <p>How can I help you today?</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.type === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`w-full px-3 py-2 rounded-lg text-sm ${
                  msg.type === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}
              >
                {msg.type === "assistant" ? (
                  <MarkdownRenderer content={msg.content} />
                ) : (
                  msg.content
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t p-3 flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
          placeholder="Type a message..."
          disabled={askMutation.isPending || processingStage !== "idle"}
          className="text-sm"
        />
        <Button
          onClick={handleSendMessage}
          disabled={!input.trim() || askMutation.isPending || processingStage !== "idle"}
          size="sm"
          className="gap-1"
        >
          {askMutation.isPending ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Send className="w-3 h-3" />
          )}
        </Button>
      </div>
    </div>
  );
}

/**
 * Export widget as standalone script
 * Usage: <script src="https://your-domain.com/chat-widget.js"></script>
 */
export function initWebChatWidget(elementId: string, options?: WebChatWidgetProps) {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`Element with id "${elementId}" not found`);
    return;
  }

  // This would be rendered by React in a real implementation
  // For now, this is a placeholder for integration
  console.log("Web chat widget initialized", { elementId, options });
}

function ProcessingTimeline({ stage }: { stage: ProcessingStage }) {
  if (stage === "idle") return null;
  const activeIndex = stageOrder.indexOf(stage);
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
      {stageOrder.map((key, idx) => (
        <div key={key} className="flex items-center gap-1">
          <div
            className={`h-2 w-2 rounded-full ${
              idx <= activeIndex ? "bg-primary animate-pulse" : "bg-muted-foreground/40"
            }`}
          />
          <span className={idx === activeIndex ? "text-primary font-semibold" : ""}>
            {stageLabels[key]}
          </span>
          {idx < stageOrder.length - 1 && <div className="h-px w-4 bg-border opacity-70" />}
        </div>
      ))}
    </div>
  );
}
