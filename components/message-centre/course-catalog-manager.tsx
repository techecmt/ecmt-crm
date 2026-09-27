"use client";

import * as React from "react";
import {
  BookOpen,
  FileText,
  Image as ImageIcon,
  Loader2,
  Plus,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  useCourseCatalog,
  useCreateCourseCatalogEntry,
  useDeleteCourseCatalogAsset,
  useDeleteCourseCatalogEntry,
  useUpdateCourseCatalogAsset,
  useUpdateCourseCatalogEntry,
  useUploadCourseCatalogAsset,
  type CourseCatalogEntry,
} from "@/lib/hooks/use-message-centre-settings";

type CourseEditorState = {
  course_name: string;
  fee_summary: string;
  fee_details: string;
  fee_amount: string;
  fee_currency: string;
  keyword_aliases: string;
  is_active: boolean;
  sort_order: number;
};

const EMPTY_EDITOR: CourseEditorState = {
  course_name: "",
  fee_summary: "",
  fee_details: "",
  fee_amount: "",
  fee_currency: "SGD",
  keyword_aliases: "",
  is_active: true,
  sort_order: 0,
};

const NO_COURSES: CourseCatalogEntry[] = [];

function editorStatesEqual(a: CourseEditorState, b: CourseEditorState) {
  return (
    a.course_name === b.course_name &&
    a.fee_summary === b.fee_summary &&
    a.fee_details === b.fee_details &&
    a.fee_amount === b.fee_amount &&
    a.fee_currency === b.fee_currency &&
    a.keyword_aliases === b.keyword_aliases &&
    a.is_active === b.is_active &&
    a.sort_order === b.sort_order
  );
}

function toEditorState(course: CourseCatalogEntry | null): CourseEditorState {
  if (!course) return { ...EMPTY_EDITOR };
  return {
    course_name: course.course_name,
    fee_summary: course.fee_summary,
    fee_details: course.fee_details,
    fee_amount: course.fee_amount === null ? "" : String(course.fee_amount),
    fee_currency: course.fee_currency || "SGD",
    keyword_aliases: (course.keyword_aliases ?? []).join(", "),
    is_active: course.is_active,
    sort_order: course.sort_order ?? 0,
  };
}

export function CourseCatalogManager({ agentId }: { agentId: string }) {
  const { data: courses = NO_COURSES, isLoading } = useCourseCatalog(agentId);
  const createCourse = useCreateCourseCatalogEntry();
  const updateCourse = useUpdateCourseCatalogEntry();
  const deleteCourse = useDeleteCourseCatalogEntry();
  const uploadAsset = useUploadCourseCatalogAsset();
  const updateAsset = useUpdateCourseCatalogAsset();
  const deleteAsset = useDeleteCourseCatalogAsset();

  const [selectedCourseId, setSelectedCourseId] = React.useState<string | "new">("new");
  const [editor, setEditor] = React.useState<CourseEditorState>({ ...EMPTY_EDITOR });
  const [assetType, setAssetType] = React.useState<"brochure" | "creative">("brochure");
  const [assetCaption, setAssetCaption] = React.useState("");
  const [assetSortOrder, setAssetSortOrder] = React.useState("0");
  const [assetFile, setAssetFile] = React.useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!courses.length) {
      setSelectedCourseId((current) => (current === "new" ? current : "new"));
      setEditor((current) =>
        editorStatesEqual(current, EMPTY_EDITOR) ? current : { ...EMPTY_EDITOR },
      );
      return;
    }

    // Keep explicit "new course" mode until the user selects an existing item.
    if (selectedCourseId === "new") {
      return;
    }

    const selected = courses.find((course) => course.id === selectedCourseId) ?? null;
    if (selected) {
      const nextEditor = toEditorState(selected);
      setEditor((current) =>
        editorStatesEqual(current, nextEditor) ? current : nextEditor,
      );
      return;
    }

    const firstCourse = courses[0];
    if (firstCourse) {
      setSelectedCourseId(firstCourse.id);
    }
  }, [courses, selectedCourseId]);

  const selectedCourse =
    selectedCourseId === "new"
      ? null
      : courses.find((course) => course.id === selectedCourseId) ?? null;

  const resetNewCourse = () => {
    setSelectedCourseId("new");
    setEditor({ ...EMPTY_EDITOR, sort_order: courses.length });
  };

  const saveCourse = () => {
    const courseName = editor.course_name.trim();
    if (!courseName) {
      toast.error("Course name is required");
      return;
    }
    const aliases = editor.keyword_aliases
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean);
    const feeAmount =
      editor.fee_amount.trim() === "" ? null : Number(editor.fee_amount.trim());
    if (feeAmount !== null && !Number.isFinite(feeAmount)) {
      toast.error("Fee amount must be a valid number");
      return;
    }

    const payload = {
      course_name: courseName,
      fee_summary: editor.fee_summary.trim(),
      fee_details: editor.fee_details.trim(),
      fee_amount: feeAmount,
      fee_currency: editor.fee_currency.trim().toUpperCase() || "SGD",
      keyword_aliases: aliases,
      is_active: editor.is_active,
      sort_order: Number.isFinite(editor.sort_order) ? editor.sort_order : 0,
    };

    if (!selectedCourse) {
      createCourse.mutate(
        { agent_id: agentId, ...payload },
        {
          onSuccess: (created) => {
            const id =
              created && typeof created === "object" && "id" in created
                ? String(created.id)
                : null;
            if (id) setSelectedCourseId(id);
            toast.success("Course created");
          },
          onError: (error) => toast.error(error.message),
        },
      );
      return;
    }

    updateCourse.mutate(
      { id: selectedCourse.id, ...payload },
      {
        onSuccess: () => toast.success("Course updated"),
        onError: (error) => toast.error(error.message),
      },
    );
  };

  const removeSelectedCourse = () => {
    if (!selectedCourse) return;
    deleteCourse.mutate(selectedCourse.id, {
      onSuccess: () => {
        toast.success("Course deleted");
        resetNewCourse();
      },
      onError: (error) => toast.error(error.message),
    });
  };

  const uploadSelectedAsset = () => {
    if (!selectedCourse) {
      toast.error("Create and save the course first");
      return;
    }
    if (!assetFile) {
      toast.error("Choose a file to upload");
      return;
    }
    const sortOrder = Number(assetSortOrder);
    uploadAsset.mutate(
      {
        courseId: selectedCourse.id,
        file: assetFile,
        assetType,
        caption: assetCaption.trim(),
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
      },
      {
        onSuccess: () => {
          setAssetCaption("");
          setAssetSortOrder("0");
          setAssetFile(null);
          if (fileInputRef.current) fileInputRef.current.value = "";
          toast.success("Asset uploaded");
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="h-4 w-4" />
          Course Catalog
        </CardTitle>
        <CardDescription>
          Add course fee details and upload brochure/creative files for WhatsApp AI replies.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[320px,1fr]">
          <div className="space-y-2 rounded-lg border p-2">
            <Button variant="outline" className="w-full" onClick={resetNewCourse}>
              <Plus className="mr-1.5 h-4 w-4" />
              New course
            </Button>
            {isLoading ? (
              <div className="py-6 text-center text-sm text-muted-foreground">Loading courses...</div>
            ) : courses.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No course entries yet.
              </div>
            ) : (
              <div className="max-h-[420px] space-y-1 overflow-y-auto">
                {courses.map((course) => (
                  <button
                    key={course.id}
                    type="button"
                    className={`w-full rounded-md border px-3 py-2 text-left transition ${
                      selectedCourseId === course.id
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/40"
                    }`}
                    onClick={() => {
                      setSelectedCourseId(course.id);
                      setEditor(toEditorState(course));
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{course.course_name}</span>
                      <Badge variant={course.is_active ? "outline" : "secondary"}>
                        {course.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {course.fee_summary || "No fee summary"}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4 rounded-lg border p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>Course name</Label>
                <Input
                  value={editor.course_name}
                  onChange={(event) =>
                    setEditor((previous) => ({ ...previous, course_name: event.target.value }))
                  }
                  placeholder="Diploma in Business Management"
                />
              </div>
              <div className="grid gap-2">
                <Label>Aliases (comma-separated)</Label>
                <Input
                  value={editor.keyword_aliases}
                  onChange={(event) =>
                    setEditor((previous) => ({
                      ...previous,
                      keyword_aliases: event.target.value,
                    }))
                  }
                  placeholder="business diploma, dbm"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="grid gap-2">
                <Label>Fee amount</Label>
                <Input
                  value={editor.fee_amount}
                  onChange={(event) =>
                    setEditor((previous) => ({ ...previous, fee_amount: event.target.value }))
                  }
                  placeholder="1200"
                />
              </div>
              <div className="grid gap-2">
                <Label>Currency</Label>
                <Input
                  value={editor.fee_currency}
                  onChange={(event) =>
                    setEditor((previous) => ({ ...previous, fee_currency: event.target.value }))
                  }
                  placeholder="SGD"
                />
              </div>
              <div className="grid gap-2">
                <Label>Sort order</Label>
                <Input
                  type="number"
                  value={String(editor.sort_order)}
                  onChange={(event) =>
                    setEditor((previous) => ({
                      ...previous,
                      sort_order: Number(event.target.value) || 0,
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Fee summary</Label>
              <Textarea
                rows={2}
                value={editor.fee_summary}
                onChange={(event) =>
                  setEditor((previous) => ({ ...previous, fee_summary: event.target.value }))
                }
                placeholder="Tuition starts from SGD 1,200 with installment options."
              />
            </div>

            <div className="grid gap-2">
              <Label>Fee details</Label>
              <Textarea
                rows={4}
                value={editor.fee_details}
                onChange={(event) =>
                  setEditor((previous) => ({ ...previous, fee_details: event.target.value }))
                }
                placeholder="Include full fee breakdown, payment terms, discounts, and notes."
              />
            </div>

            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <p className="text-sm font-medium">Active in AI matching</p>
                <p className="text-xs text-muted-foreground">
                  Inactive courses are ignored for auto replies and auto-send assets.
                </p>
              </div>
              <Switch
                checked={editor.is_active}
                onCheckedChange={(checked) =>
                  setEditor((previous) => ({ ...previous, is_active: checked }))
                }
              />
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
              {selectedCourse ? (
                <Button
                  variant="outline"
                  onClick={removeSelectedCourse}
                  disabled={deleteCourse.isPending}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              ) : null}
              <Button
                onClick={saveCourse}
                disabled={createCourse.isPending || updateCourse.isPending}
              >
                {createCourse.isPending || updateCourse.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save course
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-lg border p-4">
          <h4 className="text-sm font-semibold">Brochures & creatives</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Upload files for the selected course. AI sends these when users ask for brochure or
            creative details.
          </p>

          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <div className="grid gap-2">
              <Label>Asset type</Label>
              <Select value={assetType} onValueChange={(value) => setAssetType(value as "brochure" | "creative")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="brochure">Brochure</SelectItem>
                  <SelectItem value="creative">Creative</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 md:col-span-2">
              <Label>Caption (optional)</Label>
              <Input
                value={assetCaption}
                onChange={(event) => setAssetCaption(event.target.value)}
                placeholder="Course brochure attached"
              />
            </div>
            <div className="grid gap-2">
              <Label>Sort order</Label>
              <Input
                type="number"
                value={assetSortOrder}
                onChange={(event) => setAssetSortOrder(event.target.value)}
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
              className="max-w-sm"
              onChange={(event) => setAssetFile(event.target.files?.[0] ?? null)}
            />
            <Button onClick={uploadSelectedAsset} disabled={uploadAsset.isPending}>
              {uploadAsset.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Upload
            </Button>
          </div>

          <div className="mt-4 space-y-2">
            {(selectedCourse?.assets ?? []).length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                No assets uploaded for this course.
              </div>
            ) : (
              selectedCourse?.assets.map((asset) => (
                <div key={asset.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{asset.asset_type}</Badge>
                        <Badge variant="outline">{asset.media_type}</Badge>
                        <Badge variant={asset.is_active ? "outline" : "secondary"}>
                          {asset.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate text-sm font-medium">
                        {asset.filename || "Asset file"}
                      </p>
                      {asset.caption ? (
                        <p className="text-xs text-muted-foreground">{asset.caption}</p>
                      ) : null}
                      <a
                        className="text-xs text-blue-600 hover:underline"
                        href={asset.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open file
                      </a>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          updateAsset.mutate(
                            { id: asset.id, is_active: !asset.is_active },
                            {
                              onError: (error) => toast.error(error.message),
                            },
                          )
                        }
                      >
                        {asset.is_active ? "Disable" : "Enable"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          deleteAsset.mutate(asset.id, {
                            onError: (error) => toast.error(error.message),
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    {asset.media_type === "document" ? (
                      <FileText className="h-3.5 w-3.5" />
                    ) : (
                      <ImageIcon className="h-3.5 w-3.5" />
                    )}
                    <span>Sort: {asset.sort_order}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
