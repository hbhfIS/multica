"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceId } from "@multica/core/hooks";
import { useWorkspacePaths } from "@multica/core/paths";
import { docDetailOptions } from "@multica/core/workspace/queries";
import { api } from "@multica/core/api";
import { ArrowLeft, Trash2 } from "@multica/ui/icons";
import { IconButton } from "@multica/ui/components/common/icon-button";
import { Skeleton } from "@multica/ui/components/ui/skeleton";
import { useT } from "../../i18n";
import { ContentEditor, TitleEditor, type ContentEditorRef, type TitleEditorRef } from "../../editor";
import { AppLink, useNavigation } from "../../navigation";

const AUTOSAVE_DEBOUNCE_MS = 1500;

export function DocDetailPage({ docId }: { docId: string }) {
  const { t } = useT("docs");
  const wsId = useWorkspaceId();
  const paths = useWorkspacePaths();
  const qc = useQueryClient();
  const navigation = useNavigation();
  const contentEditorRef = useRef<ContentEditorRef>(null);
  const titleEditorRef = useRef<TitleEditorRef>(null);

  const [pendingTitle, setPendingTitle] = useState<string | null>(null);
  const [pendingContent, setPendingContent] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: doc, isLoading } = useQuery(docDetailOptions(wsId, docId));

  const updateMutation = useMutation({
    mutationFn: (patch: { title?: string; content?: string }) =>
      api.updateDoc(docId, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspaces", wsId, "docs"] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => api.archiveDoc(docId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspaces", wsId, "docs"] });
      navigation.push(paths.docs());
    },
  });

  const scheduleSave = useCallback((patch: { title?: string; content?: string }) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateMutation.mutate(patch);
      setPendingTitle(null);
      setPendingContent(null);
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [updateMutation]);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-full flex-col gap-4 p-8">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p className="text-sm">{t(($) => $.page.not_found)}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <AppLink
          href={paths.docs()}
          aria-label={t(($) => $.page.back)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <ArrowLeft className="h-4 w-4" />
        </AppLink>
        <div className="flex-1" />
        <IconButton
          label={t(($) => $.page.archive)}
          className="text-destructive hover:text-destructive"
          onClick={() => archiveMutation.mutate()}
          disabled={archiveMutation.isPending}
        >
          <Trash2 />
        </IconButton>
      </div>

      {/* Editor area */}
      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="mx-auto max-w-3xl">
          <TitleEditor
            ref={titleEditorRef}
            defaultValue={doc.title}
            placeholder={t(($) => $.page.title_placeholder)}
            className="mb-4"
            onChange={(title) => {
              setPendingTitle(title);
              scheduleSave({ title, content: pendingContent ?? doc.content });
            }}
          />
          <ContentEditor
            ref={contentEditorRef}
            defaultValue={doc.content}
            placeholder={t(($) => $.page.body_placeholder)}
            onUpdate={(content) => {
              setPendingContent(content);
              scheduleSave({ title: pendingTitle ?? doc.title, content });
            }}
          />
        </div>
      </div>
    </div>
  );
}
