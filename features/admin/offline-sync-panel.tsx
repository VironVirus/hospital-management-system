"use client";

import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  PencilLine,
  RefreshCw,
  Trash2,
  WifiOff
} from "lucide-react";
import { useOffline } from "@/components/offline-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { db, type ConflictRecord, type QueueRecord } from "@/lib/dexie";
import {
  acceptRemoteConflict,
  clearResolvedQueueItems,
  retryAllQueueConflicts,
  retryQueueConflict,
  updateQueueConflictPayload
} from "@/lib/offline-core";
import type { Json } from "@/types/supabase";

function formatJsonPreview(value: Json) {
  return JSON.stringify(value, null, 2);
}

export function OfflineSyncPanel() {
  const { conflicts, failed, isOnline, pending, processing, syncNow } = useOffline();
  const { toast } = useToast();
  const [queueItems, setQueueItems] = useState<QueueRecord[]>([]);
  const [conflictItems, setConflictItems] = useState<ConflictRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [editingConflictId, setEditingConflictId] = useState<string | null>(null);
  const [conflictDrafts, setConflictDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    const queueSubscription = liveQuery(() =>
      db.sync_queue.orderBy("createdAt").reverse().limit(10).toArray()
    ).subscribe({
      next: setQueueItems,
      error: () => {
        // Ignore local live query failures.
      }
    });

    const conflictSubscription = liveQuery(() =>
      db.sync_conflicts.filter((row) => row.resolvedAt === null).reverse().sortBy("createdAt")
    ).subscribe({
      next: (rows) => setConflictItems(rows.slice(0, 8)),
      error: () => {
        // Ignore local live query failures.
      }
    });

    return () => {
      queueSubscription.unsubscribe();
      conflictSubscription.unsubscribe();
    };
  }, []);

  const handleResolveConflict = async (conflictId: string) => {
    await db.sync_conflicts.update(conflictId, {
      resolvedAt: new Date().toISOString()
    });
    toast({
      title: "Conflict dismissed",
      description: "The conflict was removed from the active review queue.",
      variant: "success"
    });
  };

  const handleRetryConflict = async (conflictId: string) => {
    try {
      setBusy(true);
      await retryQueueConflict(conflictId);
      toast({
        title: "Conflict queued for retry",
        description: "The local change was returned to the sync queue.",
        variant: "success"
      });
    } catch (error) {
      toast({
        title: "Retry failed",
        description: error instanceof Error ? error.message : "Unable to retry this conflict.",
        variant: "error"
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSyncNow = async () => {
    try {
      setBusy(true);
      await syncNow();
    } finally {
      setBusy(false);
    }
  };

  const handleRetryAllConflicts = async () => {
    try {
      setBusy(true);
      await retryAllQueueConflicts();
      toast({
        title: "Conflicts queued",
        description: "All visible conflicts were returned to the sync queue.",
        variant: "success"
      });
    } catch (error) {
      toast({
        title: "Bulk retry failed",
        description: error instanceof Error ? error.message : "Unable to retry all conflicts.",
        variant: "error"
      });
    } finally {
      setBusy(false);
    }
  };

  const handleClearHistory = async () => {
    try {
      setBusy(true);
      await clearResolvedQueueItems();
      toast({
        title: "Sync history cleared",
        description: "Previously synced queue rows were removed from local history.",
        variant: "success"
      });
    } catch (error) {
      toast({
        title: "Unable to clear history",
        description: error instanceof Error ? error.message : "The synced history could not be cleared.",
        variant: "error"
      });
    } finally {
      setBusy(false);
    }
  };

  const handleOpenEditor = (conflict: ConflictRecord) => {
    setEditingConflictId((current) => (current === conflict.id ? null : conflict.id));
    setConflictDrafts((current) => ({
      ...current,
      [conflict.id]: current[conflict.id] ?? formatJsonPreview(conflict.localPayload)
    }));
  };

  const handleSaveConflictDraft = async (conflictId: string) => {
    const draft = conflictDrafts[conflictId];
    if (!draft) {
      return;
    }

    try {
      setBusy(true);
      await updateQueueConflictPayload(conflictId, JSON.parse(draft) as Json);
      setEditingConflictId(null);
      toast({
        title: "Conflict updated",
        description: "The local payload was saved. Retry it when you are ready.",
        variant: "success"
      });
    } catch (error) {
      toast({
        title: "Draft save failed",
        description:
          error instanceof Error ? error.message : "The edited payload could not be saved.",
        variant: "error"
      });
    } finally {
      setBusy(false);
    }
  };

  const handleAcceptRemote = async (conflictId: string) => {
    try {
      setBusy(true);
      await acceptRemoteConflict(conflictId);
      setEditingConflictId(null);
      toast({
        title: "Remote version kept",
        description: "The conflicting local change was removed and the remote record was preserved.",
        variant: "success"
      });
    } catch (error) {
      toast({
        title: "Unable to use remote version",
        description:
          error instanceof Error ? error.message : "The remote version could not be applied.",
        variant: "error"
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-blue-100">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <WifiOff className="h-5 w-5 text-blue-700" />
              Offline sync control
            </CardTitle>
            <CardDescription>
              Review queued mutations, replay them when connected, and manually resolve
              critical conflicts.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={isOnline ? "default" : "secondary"}>
              {isOnline ? "Online" : "Offline"}
            </Badge>
            <Badge variant="outline">{pending} pending</Badge>
            {failed > 0 ? <Badge variant="secondary">{failed} failed</Badge> : null}
            {conflicts > 0 ? (
              <Badge className="border-transparent bg-amber-100 text-amber-700">
                {conflicts} conflicts
              </Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap gap-3">
          <Button disabled={!isOnline || processing || busy} onClick={() => void handleSyncNow()}>
            {processing || busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Sync now
          </Button>
          <Button
            disabled={!isOnline || busy || conflictItems.length === 0}
            variant="outline"
            onClick={() => void handleRetryAllConflicts()}
          >
            <RefreshCw className="h-4 w-4" />
            Retry all conflicts
          </Button>
          <Button disabled={busy} variant="outline" onClick={() => void handleClearHistory()}>
            Clear synced history
          </Button>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-900">Queued mutations</p>
            {queueItems.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                No local mutations are queued right now.
              </div>
            ) : (
              queueItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">
                        {item.entity} / {item.action}
                      </p>
                      <p className="text-xs text-slate-500">{item.recordId}</p>
                    </div>
                    <Badge variant="outline">{item.status}</Badge>
                  </div>
                  {item.lastError ? (
                    <p className="mt-2 text-sm text-red-700">{item.lastError}</p>
                  ) : null}
                </div>
              ))
            )}
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-900">Critical conflicts</p>
            {conflictItems.length === 0 ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-5 text-sm text-emerald-800">
                No unresolved conflicts are waiting for manual review.
              </div>
            ) : (
              conflictItems.map((conflict) => {
                const isEditing = editingConflictId === conflict.id;
                return (
                  <div
                    key={conflict.id}
                    className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="flex items-center gap-2 text-sm font-semibold text-amber-950">
                          <AlertTriangle className="h-4 w-4" />
                          {conflict.entity} conflict
                        </p>
                        <p className="mt-1 text-sm text-amber-900">{conflict.reason}</p>
                        <p className="mt-1 text-xs text-amber-800/80">{conflict.recordId}</p>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-3 xl:grid-cols-2">
                      <div className="rounded-xl border border-white/80 bg-white/80 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Local payload
                        </p>
                        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-slate-700">
                          {formatJsonPreview(conflict.localPayload)}
                        </pre>
                      </div>
                      <div className="rounded-xl border border-white/80 bg-white/80 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Remote payload
                        </p>
                        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-slate-700">
                          {conflict.remotePayload
                            ? formatJsonPreview(conflict.remotePayload)
                            : "No remote payload was returned."}
                        </pre>
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="mt-3 space-y-3 rounded-xl border border-white/80 bg-white/80 p-3">
                        <p className="text-sm font-medium text-slate-900">Edit local payload JSON</p>
                        <Textarea
                          className="min-h-40 font-mono text-xs"
                          value={conflictDrafts[conflict.id] ?? ""}
                          onChange={(event) =>
                            setConflictDrafts((current) => ({
                              ...current,
                              [conflict.id]: event.target.value
                            }))
                          }
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleSaveConflictDraft(conflict.id)}
                          >
                            Save local edit
                          </Button>
                          <Button
                            type="button"
                            disabled={!isOnline || busy}
                            variant="outline"
                            onClick={() => void handleRetryConflict(conflict.id)}
                          >
                            Retry after save
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => handleOpenEditor(conflict)}
                      >
                        <PencilLine className="h-4 w-4" />
                        {isEditing ? "Close editor" : "Edit local payload"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!isOnline || busy}
                        onClick={() => void handleRetryConflict(conflict.id)}
                      >
                        <RefreshCw className="h-4 w-4" />
                        Retry
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void handleAcceptRemote(conflict.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                        {conflict.remotePayload ? "Use remote copy" : "Remove local change"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void handleResolveConflict(conflict.id)}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Dismiss
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
