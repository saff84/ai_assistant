import { useState, useEffect, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Save, Trash2, ArrowLeft, Table, FileText, Image, List, Tag, Package, Plus, X, Grid3x3, MousePointer2, Square } from "lucide-react";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import ManualRegionSelector from "@/components/ManualRegionSelector";

export default function DocumentAnnotationPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const documentId = parseInt(params.id || "0", 10);

  const [annotationMode, setAnnotationMode] = useState<"chunks" | "manual">("manual");
  const [selectedChunkIndex, setSelectedChunkIndex] = useState<number | null>(null);
  const [annotationType, setAnnotationType] = useState<"table" | "table_with_articles" | "text" | "figure" | "list">("text");
  const [isNomenclatureTable, setIsNomenclatureTable] = useState(false);
  const [productGroupId, setProductGroupId] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [isCreateGroupDialogOpen, setIsCreateGroupDialogOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");

  // Fetch document info
  const { data: document, isLoading: isLoadingDocument, error: documentError } = trpc.document.getDocument.useQuery(
    { id: documentId },
    { enabled: documentId > 0 }
  );

  // Fetch chunks with annotations (only if document exists, is indexed, AND has chunks)
  // For manual annotation documents, chunks are created from selected regions, so don't fetch if chunksCount is 0
  const chunksQueryEnabled =
    documentId > 0 &&
    document !== undefined &&
    document?.status === "indexed";
  const { data: chunks, isLoading: isLoadingChunks, refetch } = trpc.document.getDocumentChunksWithAnnotations.useQuery(
    { documentId },
    { 
      enabled: chunksQueryEnabled,
      retry: false,
    }
  );

  // Fetch product groups
  const { data: productGroups, refetch: refetchGroups } = trpc.document.getDocumentProductGroups.useQuery(
    { documentId },
    { enabled: documentId > 0 }
  );

  // Fetch products for selected chunk (if it's a table with articles)
  const selectedChunk = selectedChunkIndex !== null ? chunks?.find((c) => c.chunkIndex === selectedChunkIndex) : null;
  const { data: productsInChunk } = trpc.document.getProductDetails.useQuery(
    { documentId, productSku: "" },
    { enabled: false } // We'll fetch products differently
  );

  // Save annotation mutation
  const saveAnnotationMutation = trpc.document.upsertChunkAnnotation.useMutation({
    onSuccess: () => {
      toast.success("Разметка сохранена");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Ошибка сохранения разметки");
    },
  });

  // Delete annotation mutation
  const deleteAnnotationMutation = trpc.document.deleteChunkAnnotation.useMutation({
    onSuccess: () => {
      toast.success("Разметка удалена");
      refetch();
      setSelectedChunkIndex(null);
    },
    onError: (error) => {
      toast.error(error.message || "Ошибка удаления разметки");
    },
  });

  // Create product group mutation
  const createGroupMutation = trpc.document.createProductGroup.useMutation({
    onSuccess: (result) => {
      toast.success("Товарная группа создана");
      refetchGroups();
      setProductGroupId(result.groupId);
      setIsCreateGroupDialogOpen(false);
      setNewGroupName("");
      setNewGroupDescription("");
    },
    onError: (error) => {
      toast.error(error.message || "Ошибка создания группы");
    },
  });

  // Load annotation when chunk is selected
  useEffect(() => {
    if (selectedChunkIndex !== null && chunks) {
      const chunk = chunks.find((c) => c.chunkIndex === selectedChunkIndex);
      if (chunk?.annotation) {
        setAnnotationType(chunk.annotation.annotationType as any);
        setIsNomenclatureTable(chunk.annotation.isNomenclatureTable);
        setProductGroupId(chunk.annotation.productGroupId ?? null);
        setNotes(chunk.annotation.notes || "");
      } else {
        // Reset to defaults
        setAnnotationType("text");
        setIsNomenclatureTable(false);
        setProductGroupId(null);
        setNotes("");
      }
    }
  }, [selectedChunkIndex, chunks]);

  const handleSaveAnnotation = () => {
    if (selectedChunkIndex === null) return;

    saveAnnotationMutation.mutate({
      documentId,
      chunkIndex: selectedChunkIndex,
      annotationType,
      isNomenclatureTable,
      productGroupId: productGroupId ?? undefined,
      notes: notes.trim() || undefined,
    });
  };

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) {
      toast.error("Введите название группы");
      return;
    }

    const selectedChunk = chunks?.find((c) => c.chunkIndex === selectedChunkIndex);
    createGroupMutation.mutate({
      documentId,
      name: newGroupName.trim(),
      description: newGroupDescription.trim() || undefined,
      sectionPath: selectedChunk?.sectionPath || undefined,
      pageStart: selectedChunk?.pageNumber || undefined,
      pageEnd: selectedChunk?.pageNumber || undefined,
    });
  };

  const handleDeleteAnnotation = () => {
    if (selectedChunkIndex === null) return;

    deleteAnnotationMutation.mutate({
      documentId,
      chunkIndex: selectedChunkIndex,
    });
  };

  const getAnnotationTypeIcon = (type: string) => {
    switch (type) {
      case "table":
      case "table_with_articles":
        return <Table className="w-4 h-4" />;
      case "figure":
        return <Image className="w-4 h-4" />;
      case "list":
        return <List className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const getAnnotationTypeColor = (type: string, isNomenclature: boolean) => {
    if (isNomenclature) return "bg-green-500";
    if (type === "table" || type === "table_with_articles") return "bg-blue-500";
    if (type === "figure") return "bg-purple-500";
    if (type === "list") return "bg-orange-500";
    return "bg-gray-500";
  };

  // Show loading while fetching document
  if (isLoadingDocument) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Document not found or error
  if (!document || documentError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <p className="text-muted-foreground text-lg">Документ не найден</p>
        <Button variant="outline" onClick={() => setLocation("/documents")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Вернуться к списку документов
        </Button>
      </div>
    );
  }

  // Document is still processing
  if (document.status === "processing") {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold">Документ обрабатывается</p>
          <p className="text-muted-foreground">
            {document.processingMessage || `Стадия: ${document.processingStage || "неизвестно"}`}
          </p>
          {document.processingProgress !== null && (
            <p className="text-sm text-muted-foreground">
              Прогресс: {Math.round(document.processingProgress)}%
            </p>
          )}
        </div>
        <Button variant="outline" onClick={() => setLocation("/documents")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Вернуться к списку документов
        </Button>
      </div>
    );
  }

  // Document failed to process
  if (document.status === "failed") {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <p className="text-destructive text-lg">Ошибка обработки документа</p>
        {document.errorMessage && (
          <p className="text-muted-foreground max-w-md text-center">{document.errorMessage}</p>
        )}
        <Button variant="outline" onClick={() => setLocation("/documents")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Вернуться к списку документов
        </Button>
      </div>
    );
  }

  // Document is indexed - show annotation interface with mode switcher
  // Allow both chunk-based and manual region annotation

  // If document has no chunks, default to manual mode
  const loadedChunksCount = chunks?.length ?? 0;
  const hasChunks = loadedChunksCount > 0;
  const hasNoChunks = !hasChunks && !isLoadingChunks;
  const shouldShowManualMode = !hasChunks || annotationMode === "manual";
  const shouldShowChunksMode = hasChunks && annotationMode === "chunks";

  // Document is indexed but chunks are loading (only if we expect chunks)
  if (isLoadingChunks && hasChunks) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">Загрузка чанков...</p>
      </div>
    );
  }

  // If document has 0 chunks, show manual annotation interface immediately (before checking chunks)
  if (hasNoChunks) {
    return (
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/documents")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Назад
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Ручная разметка документа</h1>
              <p className="text-muted-foreground">{document.filename}</p>
            </div>
          </div>
        </div>

        {/* Manual annotation interface */}
        <ManualRegionSelector 
          documentId={documentId}
          filename={document.filename}
          onRegionsCreated={() => {
            // Refresh chunks if they exist, otherwise just refetch
            if ((document.chunksCount ?? 0) > 0) {
              refetch();
            } else {
              // Reload page to show chunks after regions are created
              window.location.reload();
            }
          }}
        />
      </div>
    );
  }

  // Document is indexed but no chunks found (only if we expected chunks)
  if (shouldShowChunksMode && (!chunks || chunks.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <p className="text-muted-foreground text-lg">Чанки не найдены</p>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          Документ проиндексирован, но загрузить список чанков не удалось. Попробуйте обновить страницу
          или переключитесь на вкладку «Ручная разметка», чтобы продолжить выделение областей.
        </p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Обновить страницу
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/documents")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Назад
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Разметка документа</h1>
            <p className="text-muted-foreground">{document.filename}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {shouldShowChunksMode && chunks && (
            <Badge variant="outline">
              {chunks.length} чанков • {chunks.filter((c) => c.annotation).length} размечено
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation(`/documents/${documentId}/visualize`)}
            title="Визуализация документа"
          >
            <Grid3x3 className="w-4 h-4 mr-2" />
            Визуализация
          </Button>
        </div>
      </div>

      {/* Mode Switcher */}
      {(document.chunksCount ?? 0) > 0 && (
        <Card>
          <CardContent className="pt-6">
            <Tabs value={annotationMode} onValueChange={(v) => setAnnotationMode(v as "chunks" | "manual")}>
              <TabsList className="grid w-full max-w-md grid-cols-2">
                <TabsTrigger value="chunks" className="gap-2">
                  <MousePointer2 className="w-4 h-4" />
                  Разметка чанков
                </TabsTrigger>
                <TabsTrigger value="manual" className="gap-2">
                  <Square className="w-4 h-4" />
                  Ручная разметка
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Manual Region Annotation Mode */}
      {shouldShowManualMode && (
        <ManualRegionSelector 
          documentId={documentId}
          filename={document.filename}
          onRegionsCreated={() => {
            // Refresh chunks if they exist, otherwise just refetch
            if ((document.chunksCount ?? 0) > 0) {
              refetch();
            } else {
              // Reload page to show chunks after regions are created
              window.location.reload();
            }
          }}
        />
      )}

      {/* Chunk-based Annotation Mode */}
      {shouldShowChunksMode && chunks && chunks.length > 0 && (
        <>
        <div className="grid gap-6 lg:grid-cols-4" style={{ height: 'calc(100vh - 200px)' }}>
        {/* Chunks List */}
        <div className="lg:col-span-2">
          <Card className="h-full flex flex-col">
            <CardHeader>
              <CardTitle>Чанки документа</CardTitle>
              <CardDescription>Выберите чанк для разметки</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="space-y-3">
                  {chunks.map((chunk) => {
                    const isSelected = selectedChunkIndex === chunk.chunkIndex;
                    const hasAnnotation = !!chunk.annotation;
                    const isNomenclature = chunk.annotation?.isNomenclatureTable || false;

                    return (
                      <Card
                        key={chunk.chunkIndex}
                        className={`cursor-pointer transition-all ${
                          isSelected ? "ring-2 ring-primary" : ""
                        } ${hasAnnotation ? "border-l-4 border-l-green-500" : ""}`}
                        onClick={() => setSelectedChunkIndex(chunk.chunkIndex)}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <CardTitle className="text-base">
                                  Чанк #{chunk.chunkIndex}
                                </CardTitle>
                                {hasAnnotation && (
                                  <>
                                    <Badge
                                      className={getAnnotationTypeColor(
                                        chunk.annotation!.annotationType,
                                        isNomenclature
                                      )}
                                    >
                                      {getAnnotationTypeIcon(chunk.annotation!.annotationType)}
                                      <span className="ml-1">
                                        {chunk.annotation!.annotationType === "table_with_articles"
                                          ? "Таблица с артикулами"
                                          : chunk.annotation!.annotationType === "table"
                                          ? "Таблица"
                                          : chunk.annotation!.annotationType === "figure"
                                          ? "Рисунок"
                                          : chunk.annotation!.annotationType === "list"
                                          ? "Список"
                                          : "Текст"}
                                      </span>
                                      {isNomenclature && (
                                        <Tag className="w-3 h-3 ml-1" />
                                      )}
                                    </Badge>
                                    {chunk.annotation!.productGroupId && (
                                      <Badge variant="outline" className="bg-blue-50 dark:bg-blue-950/20">
                                        <Package className="w-3 h-3 mr-1" />
                                        {productGroups?.find((g) => g.id === chunk.annotation!.productGroupId)?.name || "Группа"}
                                      </Badge>
                                    )}
                                  </>
                                )}
                              </div>
                              <CardDescription className="text-xs">
                                Страница: {chunk.pageNumber || "?"} • Раздел: {chunk.sectionPath || "не указан"} • 
                                Тип: {chunk.elementType} • Токены: {chunk.tokenCount}
                              </CardDescription>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="text-sm text-muted-foreground line-clamp-3">
                            {chunk.content.slice(0, 200)}
                            {chunk.content.length > 200 && "..."}
                          </div>
                          {chunk.tableJson && chunk.tableJson.length > 0 && (
                            <div className="mt-2 text-xs text-blue-600">
                              📊 Таблица: {chunk.tableJson.length} строк
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Document Visualization */}
        <div className="lg:col-span-1">
          <Card className="h-full flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Визуализация документа</CardTitle>
              <CardDescription className="text-xs">
                {document.pages || 0} страниц • {chunks.length} чанков
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <DocumentVisualization
                  document={document}
                  chunks={chunks}
                  selectedChunkIndex={selectedChunkIndex}
                  onChunkSelect={setSelectedChunkIndex}
                />
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Annotation Panel */}
        <div className="lg:col-span-1 space-y-4">
          {selectedChunkIndex !== null ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Разметка чанка #{selectedChunkIndex}</CardTitle>
                  <CardDescription>Укажите тип элемента и дополнительные параметры</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Annotation Type */}
                  <div className="space-y-3">
                    <Label>Тип элемента</Label>
                    <RadioGroup
                      value={annotationType}
                      onValueChange={(value) =>
                        setAnnotationType(value as typeof annotationType)
                      }
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="text" id="text" />
                        <Label htmlFor="text" className="cursor-pointer flex items-center gap-2">
                          <FileText className="w-4 h-4" />
                          Текст
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="table" id="table" />
                        <Label htmlFor="table" className="cursor-pointer flex items-center gap-2">
                          <Table className="w-4 h-4" />
                          Таблица
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="table_with_articles" id="table_with_articles" />
                        <Label htmlFor="table_with_articles" className="cursor-pointer flex items-center gap-2">
                          <Table className="w-4 h-4" />
                          Таблица с артикулами
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="figure" id="figure" />
                        <Label htmlFor="figure" className="cursor-pointer flex items-center gap-2">
                          <Image className="w-4 h-4" />
                          Рисунок
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="list" id="list" />
                        <Label htmlFor="list" className="cursor-pointer flex items-center gap-2">
                          <List className="w-4 h-4" />
                          Список
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {/* Nomenclature Table Checkbox */}
                  {(annotationType === "table" || annotationType === "table_with_articles") && (
                    <>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="nomenclature"
                          checked={isNomenclatureTable}
                          onCheckedChange={(checked) => setIsNomenclatureTable(checked === true)}
                        />
                        <Label htmlFor="nomenclature" className="cursor-pointer flex items-center gap-2">
                          <Tag className="w-4 h-4" />
                          Номенклатурная таблица (содержит артикулы/SKU)
                        </Label>
                      </div>

                      {/* Product Group Selection */}
                      {isNomenclatureTable && (
                        <div className="space-y-2">
                          <Label>Товарная группа</Label>
                          <div className="flex gap-2">
                            <Select
                              value={productGroupId?.toString() || ""}
                              onValueChange={(value) => setProductGroupId(value ? parseInt(value) : null)}
                            >
                              <SelectTrigger className="flex-1">
                                <SelectValue placeholder="Выберите группу или создайте новую" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="">Без группы</SelectItem>
                                {productGroups?.map((group) => (
                                  <SelectItem key={group.id} value={group.id.toString()}>
                                    {group.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => setIsCreateGroupDialogOpen(true)}
                              title="Создать новую группу"
                            >
                              <Plus className="w-4 h-4" />
                            </Button>
                          </div>
                          {productGroupId && (
                            <div className="text-xs text-muted-foreground">
                              Товары из этого чанка будут добавлены в выбранную группу
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {/* Notes */}
                  <div className="space-y-2">
                    <Label htmlFor="notes">Заметки (необязательно)</Label>
                    <Textarea
                      id="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Дополнительные заметки о чанке..."
                      rows={3}
                    />
                  </div>

                  <Separator />

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      onClick={handleSaveAnnotation}
                      disabled={saveAnnotationMutation.isPending}
                      className="flex-1"
                    >
                      {saveAnnotationMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Сохранение...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          Сохранить
                        </>
                      )}
                    </Button>
                    {chunks.find((c) => c.chunkIndex === selectedChunkIndex)?.annotation && (
                      <Button
                        variant="destructive"
                        onClick={handleDeleteAnnotation}
                        disabled={deleteAnnotationMutation.isPending}
                      >
                        {deleteAnnotationMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Chunk Preview */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Предпросмотр чанка</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-64">
                    <div className="text-sm whitespace-pre-wrap font-mono text-xs bg-muted p-3 rounded">
                      {chunks.find((c) => c.chunkIndex === selectedChunkIndex)?.content}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-muted-foreground py-12">
                  <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Выберите чанк для разметки</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      </>
      )}

      {/* Create Product Group Dialog */}
      <Dialog open={isCreateGroupDialogOpen} onOpenChange={setIsCreateGroupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Создать товарную группу</DialogTitle>
            <DialogDescription>
              Создайте новую группу для организации товаров из таблиц
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="groupName">Название группы *</Label>
              <Input
                id="groupName"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Например: Трубы SANEXT"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newGroupName.trim()) {
                    handleCreateGroup();
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="groupDescription">Описание (необязательно)</Label>
              <Textarea
                id="groupDescription"
                value={newGroupDescription}
                onChange={(e) => setNewGroupDescription(e.target.value)}
                placeholder="Дополнительное описание группы..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateGroupDialogOpen(false);
                setNewGroupName("");
                setNewGroupDescription("");
              }}
            >
              Отмена
            </Button>
            <Button
              onClick={handleCreateGroup}
              disabled={createGroupMutation.isPending || !newGroupName.trim()}
            >
              {createGroupMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Создание...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Создать
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Document Visualization Component
function DocumentVisualization({
  document,
  chunks,
  selectedChunkIndex,
  onChunkSelect,
}: {
  document: { pages: number | null };
  chunks: Array<{
    chunkIndex: number;
    pageNumber: number | null;
    annotation: {
      annotationType: string;
      isNomenclatureTable: boolean;
    } | null;
  }>;
  selectedChunkIndex: number | null;
  onChunkSelect: (chunkIndex: number) => void;
}) {
  // Group chunks by page
  const chunksByPage = useMemo(() => {
    const map = new Map<number, typeof chunks>();
    chunks.forEach((chunk) => {
      const page = chunk.pageNumber || 0;
      if (!map.has(page)) {
        map.set(page, []);
      }
      map.get(page)!.push(chunk);
    });
    return map;
  }, [chunks]);

  const totalPages = document.pages || 0;
  const pageHeight = 120; // Height of each page representation
  const chunkHeight = 20; // Height of each chunk representation

  return (
    <div className="space-y-4">
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
        const pageChunks = chunksByPage.get(pageNum) || [];
        const annotatedCount = pageChunks.filter((c) => c.annotation).length;
        const totalChunksOnPage = pageChunks.length;

        return (
          <div key={pageNum} className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span className="font-medium">Страница {pageNum}</span>
              {totalChunksOnPage > 0 && (
                <span>
                  {annotatedCount}/{totalChunksOnPage}
                </span>
              )}
            </div>
            <div
              className="relative border-2 border-border rounded-md bg-background p-2 min-h-[80px]"
              style={{ minHeight: `${Math.max(80, totalChunksOnPage * chunkHeight + 20)}px` }}
            >
              {totalChunksOnPage === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-4">
                  Нет чанков
                </div>
              ) : (
                <div className="space-y-1">
                  {pageChunks.map((chunk) => {
                    const hasAnnotation = !!chunk.annotation;
                    const isSelected = selectedChunkIndex === chunk.chunkIndex;
                    const isNomenclature = chunk.annotation?.isNomenclatureTable || false;

                    return (
                      <div
                        key={chunk.chunkIndex}
                        onClick={() => onChunkSelect(chunk.chunkIndex)}
                        className={cn(
                          "relative rounded px-2 py-1 text-xs cursor-pointer transition-all border",
                          "hover:shadow-sm",
                          isSelected && "ring-2 ring-primary ring-offset-1",
                          hasAnnotation
                            ? "bg-green-500/30 border-green-500/50"
                            : "bg-muted/50 border-border/50"
                        )}
                        style={{ height: `${chunkHeight}px` }}
                        title={`Чанк #${chunk.chunkIndex}${hasAnnotation ? " (размечено)" : ""}`}
                      >
                        <div className="flex items-center justify-between h-full">
                          <span className="font-medium text-[10px]">
                            #{chunk.chunkIndex}
                          </span>
                          {hasAnnotation && (
                            <div className="flex items-center gap-1">
                              {isNomenclature && (
                                <Tag className="w-2.5 h-2.5 text-green-600" />
                              )}
                              {chunk.annotation!.annotationType === "table" ||
                              chunk.annotation!.annotationType === "table_with_articles" ? (
                                <Table className="w-2.5 h-2.5 text-blue-600" />
                              ) : chunk.annotation!.annotationType === "figure" ? (
                                <Image className="w-2.5 h-2.5 text-purple-600" />
                              ) : chunk.annotation!.annotationType === "list" ? (
                                <List className="w-2.5 h-2.5 text-orange-600" />
                              ) : (
                                <FileText className="w-2.5 h-2.5 text-gray-600" />
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })}
      {totalPages === 0 && (
        <div className="text-center text-muted-foreground text-sm py-8">
          Документ не содержит страниц
        </div>
      )}
    </div>
  );
}

