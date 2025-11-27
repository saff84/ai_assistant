import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Trash2, Upload, AlertCircle, CheckCircle2, Clock, FileText, ShoppingCart, BookOpen, Eye, Tag, Grid3x3 } from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";

type ProcessingType = "general" | "instruction" | "catalog" | "manual";

export default function DocumentsPage() {
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [processingType, setProcessingType] = useState<ProcessingType>("general");
  const [shouldPoll, setShouldPoll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, setLocation] = useLocation();

  // Fetch documents
  const { data: documents, isLoading, refetch } = trpc.document.listDocuments.useQuery(undefined, {
    refetchInterval: shouldPoll ? 2000 : false,
  });

  useEffect(() => {
    if (!documents || documents.length === 0) {
      setShouldPoll(false);
      return;
    }
    const hasProcessing = documents.some(
      (doc) => doc.status === "processing" || (doc.processingStage && doc.processingStage !== "completed" && doc.processingStage !== "failed")
    );
    setShouldPoll(hasProcessing);
  }, [documents]);

  // Delete document mutation
  const deleteDocMutation = trpc.document.deleteDocument.useMutation({
    onSuccess: () => {
      toast.success("Document deleted successfully");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete document");
    },
  });

  // Regenerate all embeddings mutation
  const regenerateAllMutation = trpc.document.regenerateAllEmbeddings.useMutation({
    onSuccess: (result) => {
      toast.success(`✅ ${result.message}`);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to regenerate embeddings");
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const supportedFormats = [".pdf", ".xlsx", ".xls", ".docx"];
    const fileExt = "." + file.name.split(".").pop()?.toLowerCase();

    if (!supportedFormats.includes(fileExt)) {
      toast.error(`Unsupported file format. Supported: ${supportedFormats.join(", ")}`);
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      toast.error("File size exceeds 100MB limit");
      return;
    }

    await uploadFile(file, processingType);
  };

  const uploadFile = async (file: File, type: ProcessingType) => {
    setIsUploading(true);
    setShouldPoll(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      // If type is "manual", use "general" as processingType and set skipFullProcessing
      const actualProcessingType = type === "manual" ? "general" : type;
      const skipFullProcessing = type === "manual";
      formData.append("processingType", actualProcessingType);
      formData.append("skipFullProcessing", skipFullProcessing.toString());
      
      const response = await fetch("/api/upload/document", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Upload failed");
      }

      const result = await response.json();
      toast.success(result.message || "Document uploaded successfully");
      setIsUploadDialogOpen(false);
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      
      // Refresh document list
      refetch();
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to upload document");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteDocument = (docId: number) => {
    if (confirm("Are you sure you want to delete this document?")) {
      deleteDocMutation.mutate({ id: docId });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "indexed":
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "processing":
        return <Clock className="w-4 h-4 text-yellow-500 animate-spin" />;
      case "failed":
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStageLabel = (stage?: string | null) => {
    switch (stage) {
      case "queued":
        return "Ожидает обработки";
      case "parsing":
        return "Извлечение структуры";
      case "chunking":
        return "Разделение на чанки";
      case "embedding":
        return "Генерация эмбеддингов";
      case "saving":
        return "Сохранение данных";
      case "completed":
        return "Завершено";
      case "failed":
        return "Ошибка обработки";
      default:
        return "Подготовка";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Documents</h1>
          <p className="text-muted-foreground">Manage your knowledge base documents</p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => regenerateAllMutation.mutate()} 
            disabled={regenerateAllMutation.isPending}
            variant="outline"
            className="gap-2"
          >
            {regenerateAllMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Генерация эмбеддингов...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Перестроить индексы (AI)
              </>
            )}
          </Button>
          <Button onClick={() => setIsUploadDialogOpen(true)} className="gap-2">
            <Upload className="w-4 h-4" />
            Upload Document
          </Button>
        </div>
      </div>

      {/* Upload Dialog */}
      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>
              Upload a PDF, Excel, or Word document to add to your knowledge base
            </DialogDescription>
          </DialogHeader>

          {/* Important instructions */}
          <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
                  ⚠️ Важно! Проверьте документ перед загрузкой:
                </p>
                <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
                  <li>
                    <strong>Для PDF:</strong> откройте файл в Adobe Reader и попробуйте выделить текст мышкой
                  </li>
                  <li>
                    Если текст <strong>НЕ выделяется</strong> - это сканированный PDF без текстового слоя
                  </li>
                  <li>
                    Сканированные документы <strong>не могут быть проиндексированы</strong> (нужен OCR)
                  </li>
                  <li>
                    Используйте только PDF с <strong>текстовым слоем</strong> или конвертируйте с помощью OCR
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-4">
              <div>
                <Label className="text-base font-semibold mb-3 block">Processing Type</Label>
                <RadioGroup value={processingType} onValueChange={(value) => setProcessingType(value as ProcessingType)}>
                  <div className="space-y-3">
                    <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                      <RadioGroupItem value="general" id="general" className="mt-1" />
                      <label htmlFor="general" className="flex-1 cursor-pointer">
                        <div className="flex items-center gap-2 mb-1">
                          <FileText className="w-4 h-4" />
                          <span className="font-medium">Общий документ</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Универсальная обработка: комбинирует текст и таблицы, разбивает на смысловые блоки
                        </p>
                      </label>
                    </div>

                    <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                      <RadioGroupItem value="instruction" id="instruction" className="mt-1" />
                      <label htmlFor="instruction" className="flex-1 cursor-pointer">
                        <div className="flex items-center gap-2 mb-1">
                          <BookOpen className="w-4 h-4" />
                          <span className="font-medium">Инструкция / Пособие</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Ориентируется по оглавлению, формирует чанки по разделам и сохраняет ссылки на страницы
                        </p>
                      </label>
                    </div>

                    <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                      <RadioGroupItem value="catalog" id="catalog" className="mt-1" />
                      <label htmlFor="catalog" className="flex-1 cursor-pointer">
                        <div className="flex items-center gap-2 mb-1">
                          <ShoppingCart className="w-4 h-4" />
                          <span className="font-medium">Каталог товаров</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Для каталогов: каждый товар/категория - отдельный чанк с метаданными
                        </p>
                      </label>
                    </div>

                    <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20">
                      <RadioGroupItem value="manual" id="manual" className="mt-1" />
                      <label htmlFor="manual" className="flex-1 cursor-pointer">
                        <div className="flex items-center gap-2 mb-1">
                          <Tag className="w-4 h-4 text-green-600 dark:text-green-400" />
                          <span className="font-medium">Ручная разметка</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Только парсинг документа: разбиение на чанки без генерации эмбеддингов и автоматического извлечения продуктов. 
                          Документ будет готов для ручной разметки сразу после загрузки.
                        </p>
                      </label>
                    </div>

                  </div>
                </RadioGroup>
              </div>

              <div className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50 transition"
                onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="font-medium">Нажмите для выбора файла</p>
                <p className="text-sm text-muted-foreground">или перетащите сюда</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileSelect}
                  accept=".pdf,.xlsx,.xls,.docx"
                  className="hidden"
                />
              </div>
            </div>

            <div className="text-sm text-muted-foreground">
              <p className="font-medium mb-2">Поддерживаемые форматы:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>PDF (.pdf)</li>
                <li>Excel (.xlsx, .xls)</li>
                <li>Word (.docx)</li>
              </ul>
              <p className="mt-2">Максимальный размер файла: 100MB</p>
            </div>

            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-full"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                "Select File"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Documents List */}
      <div className="space-y-4">
        {isLoading ? (
          <Card>
            <CardContent className="pt-6">
              <div className="flex justify-center items-center h-32">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        ) : documents && documents.length > 0 ? (
          <div className="grid gap-4">
            {documents.map((doc) => (
              <Card key={doc.id}>
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">{doc.filename}</CardTitle>
                        {getStatusIcon(doc.status)}
                      </div>
                      <CardDescription>
                        {doc.fileType.toUpperCase()} • {(doc.fileSize / 1024 / 1024).toFixed(2)}MB • {doc.chunksCount} chunks
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLocation(`/documents/${doc.id}/annotate`)}
                        title="Разметка документа"
                        disabled={doc.status !== "indexed"}
                      >
                        <Tag className="w-4 h-4 mr-2" />
                        Разметка
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLocation(`/documents/${doc.id}/visualize`)}
                        title="Визуализация документа"
                        disabled={doc.status !== "indexed"}
                      >
                        <Grid3x3 className="w-4 h-4 mr-2" />
                        Визуализация
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setLocation(`/documents/${doc.id}`)}
                        title="View processing details"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteDocument(doc.id)}
                        disabled={deleteDocMutation.isPending}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground">
                    <p>Uploaded: {new Date(doc.uploadedAt).toLocaleString()}</p>
                    {doc.processingStage && (
                      <div className="mt-4 space-y-4">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-foreground">Этапы обработки</span>
                            <span className="text-xs text-muted-foreground">{Math.round(doc.processingProgress ?? 0)}%</span>
                          </div>
                          <Progress value={doc.processingProgress ?? 0} className="h-2" />
                        </div>
                        <div className="flex flex-col gap-2">
                          {[
                            { stage: "queued", label: "Ожидает обработки", icon: Clock },
                            { stage: "parsing", label: "Извлечение структуры", icon: FileText },
                            { stage: "chunking", label: "Разделение на чанки", icon: Grid3x3 },
                            { stage: "embedding", label: "Генерация эмбеддингов", icon: CheckCircle2 },
                            { stage: "saving", label: "Сохранение данных", icon: CheckCircle2 },
                            { stage: "completed", label: "Завершено", icon: CheckCircle2 },
                            { stage: "failed", label: "Ошибка обработки", icon: AlertCircle },
                          ].map(({ stage, label, icon: Icon }) => {
                            const isActive = doc.processingStage === stage;
                            const isCompleted =
                              ["completed"].includes(doc.processingStage) ||
                              (stage === "saving" && doc.processingStage === "completed") ||
                              (stage === "embedding" && ["saving", "completed"].includes(doc.processingStage)) ||
                              (stage === "chunking" && ["embedding", "saving", "completed"].includes(doc.processingStage)) ||
                              (stage === "parsing" && ["chunking", "embedding", "saving", "completed"].includes(doc.processingStage)) ||
                              (stage === "queued" && doc.processingStage !== "queued");

                            let statusClass = "text-muted-foreground";
                            let bgClass = "bg-muted";
                            let borderClass = "border-muted";
                            
                            if (isCompleted) {
                              statusClass = "text-green-600 dark:text-green-400";
                              bgClass = "bg-green-500/10";
                              borderClass = "border-green-500/30";
                            }
                            if (isActive) {
                              statusClass = "text-primary font-semibold";
                              bgClass = "bg-primary/10";
                              borderClass = "border-primary/50";
                            }
                            if (doc.processingStage === "failed" && stage === "failed") {
                              statusClass = "text-red-600 dark:text-red-400 font-semibold";
                              bgClass = "bg-red-500/10";
                              borderClass = "border-red-500/50";
                            }

                            return (
                              <div 
                                key={stage} 
                                className={`flex items-center gap-3 p-2 rounded-md border transition-all ${bgClass} ${borderClass} ${isActive ? "ring-2 ring-primary/20" : ""}`}
                              >
                                <div className={`flex-shrink-0 ${statusClass}`}>
                                  {isCompleted ? (
                                    <CheckCircle2 className="w-4 h-4" />
                                  ) : isActive ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Icon className="w-4 h-4 opacity-50" />
                                  )}
                                </div>
                                <span className={`text-sm ${statusClass}`}>{label}</span>
                              </div>
                            );
                          })}
                        </div>
                        
                        {/* Processing Message */}
                        {doc.processingMessage && (
                          <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                            <div className="flex items-start gap-2">
                              <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                              <div className="flex-1">
                                <div className="text-xs font-medium text-blue-900 dark:text-blue-100 mb-1">Сообщение обработки:</div>
                                <div className="text-sm text-blue-800 dark:text-blue-200 break-words">{doc.processingMessage}</div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Error Message */}
                        {doc.errorMessage && (
                          <div className="mt-3 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
                            <div className="flex items-start gap-2">
                              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                              <div className="flex-1">
                                <div className="text-xs font-medium text-red-900 dark:text-red-100 mb-1">Ошибка:</div>
                                <div className="text-sm text-red-800 dark:text-red-200 break-words">{doc.errorMessage}</div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Status Info */}
                        <div className="mt-4 flex flex-wrap items-center gap-3 p-3 bg-muted/50 rounded-lg">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Статус:</span>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              doc.status === "failed" 
                                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" 
                                : doc.status === "indexed" 
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                            }`}>
                              {doc.status === "processing" ? "Обработка" :
                               doc.status === "indexed" ? "Проиндексирован" :
                               doc.status === "failed" ? "Ошибка" : doc.status}
                            </span>
                          </div>
                          {doc.chunksCount !== null && doc.chunksCount !== undefined && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">Чанков:</span>
                              <span className="text-xs font-semibold">{doc.chunksCount}</span>
                            </div>
                          )}
                          {doc.pages && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">Страниц:</span>
                              <span className="text-xs font-semibold">{doc.pages}</span>
                            </div>
                          )}
                        </div>

                        {/* Metadata (expandable) */}
                        {doc.documentMetadata && typeof doc.documentMetadata === 'object' && (
                          <details className="mt-3">
                            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground font-medium">
                              Метаданные документа
                            </summary>
                            <div className="mt-2 p-2 bg-muted rounded-md font-mono text-xs overflow-auto max-h-40">
                              <pre className="whitespace-pre-wrap break-words">{JSON.stringify(doc.documentMetadata, null, 2)}</pre>
                            </div>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="p-4 bg-muted rounded-full mb-4">
                  <Upload className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Документы не загружены</h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-md">
                  Начните работу, загрузив первый документ в базу знаний. Поддерживаются форматы PDF, Excel и Word.
                </p>
                <Button
                  onClick={() => setIsUploadDialogOpen(true)}
                  className="gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Загрузить первый документ
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
