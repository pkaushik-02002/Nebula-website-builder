"use client"

import React, { useRef, useState, useEffect, useCallback } from "react"
import { cn } from "@/lib/utils"
import type { DesignSnapshot } from "./visual-edit-design-panel"
import type { VisualEditSectionItem, VisualEditStructureCommand } from "./visual-edit-structure"

type Rect = { x: number; y: number; width: number; height: number }
type Viewport = { w: number; h: number }
type SelectedElement = {
  id: string
  rect: Rect
  viewport: Viewport
  description: string | null
  sectionId?: string | null
  snapshot: DesignSnapshot
}

export interface PreviewWithVisualEditProps {
  src: string | null
  canEdit?: boolean
  enabled?: boolean
  onSelectionChange?: (selection: {
    descriptions: string[]
    primary?: {
      id: string
      description: string | null
      sectionId?: string | null
      snapshot: DesignSnapshot
    }
  } | null) => void
  externalDraft?: {
    id: string
    snapshot: DesignSnapshot
  } | null
  onIframeNavigate?: (path: string) => void
  onStructureChange?: (sections: VisualEditSectionItem[]) => void
  command?: { nonce: number; payload: VisualEditStructureCommand } | null
  className?: string
  iframeKey?: string | number
}

export function PreviewWithVisualEdit({
  src,
  canEdit = true,
  enabled = false,
  onSelectionChange,
  externalDraft,
  onIframeNavigate,
  onStructureChange,
  command,
  className,
  iframeKey,
}: PreviewWithVisualEditProps) {
  const previewAreaRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [previewSize, setPreviewSize] = useState({ w: 1, h: 1 })
  const [hover, setHover] = useState<{ rect: Rect; viewport: Viewport } | null>(null)
  const [selectedItems, setSelectedItems] = useState<SelectedElement[]>([])

  const updateSize = useCallback(() => {
    const el = previewAreaRef.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    setPreviewSize((prev) => (prev.w !== width || prev.h !== height ? { w: width, h: height } : prev))
  }, [])

  useEffect(() => {
    const el = previewAreaRef.current
    if (!el) return
    updateSize()
    const ro = new ResizeObserver(updateSize)
    ro.observe(el)
    return () => ro.disconnect()
  }, [src, updateSize])

  useEffect(() => {
    if (!enabled) {
      setHover(null)
      setSelectedItems([])
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    onSelectionChange?.(
      selectedItems.length > 0
        ? {
            descriptions: selectedItems.map((item) => item.description || "selected element"),
            primary: selectedItems.length === 1
              ? {
                  id: selectedItems[0].id,
                  description: selectedItems[0].description,
                  sectionId: selectedItems[0].sectionId,
                  snapshot: selectedItems[0].snapshot,
                }
              : undefined,
          }
        : null
    )
  }, [enabled, onSelectionChange, selectedItems])

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const d = e.data
      if (d && typeof d === "object" && d.type === "preview-navigate" && typeof d.path === "string") {
        onIframeNavigate?.(d.path)
      }
    }
    window.addEventListener("message", handler)
    return () => window.removeEventListener("message", handler)
  }, [onIframeNavigate])

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!enabled) return
      const d = e.data
      if (!d || typeof d !== "object" || d.type === undefined) return

      if (d.type === "preview-hover") {
        setHover(d.rect && d.viewport ? { rect: d.rect, viewport: d.viewport } : null)
        return
      }

      if (d.type === "preview-structure" && Array.isArray(d.sections)) {
        const sections = d.sections
          .map((item: any, index: number): VisualEditSectionItem | null => {
            if (!item || typeof item !== "object") return null
            const id = typeof item.id === "string" ? item.id : ""
            const label = typeof item.label === "string" ? item.label : `Section ${index + 1}`
            const kind = typeof item.kind === "string" ? item.kind : "generic"
            if (!id) return null
            return { id, label, kind: kind as VisualEditSectionItem["kind"], index }
          })
          .filter((item: VisualEditSectionItem | null): item is VisualEditSectionItem => item !== null)
        onStructureChange?.(sections)
        return
      }

      if (d.type !== "preview-select") return

      const raw = d.snapshot && typeof d.snapshot === "object" ? d.snapshot : null
      const content =
        typeof raw?.content === "string"
          ? raw.content
          : typeof d.description === "string"
            ? (() => {
                const match = d.description.match(/"([^"]*)"/)
                return match ? match[1].trim() : undefined
              })()
            : undefined
      const styles = raw?.styles && typeof raw.styles === "object" ? { ...raw.styles } : undefined

      if (!(d.rect && d.viewport && d.id)) {
        setSelectedItems([])
        return
      }

      const nextSelection: SelectedElement = {
        id: d.id,
        rect: d.rect,
        viewport: d.viewport,
        description: d.description ?? null,
        sectionId: typeof d.sectionId === "string" ? d.sectionId : null,
        snapshot: { content, styles },
      }

      setSelectedItems((prev) => {
        let nextItems: SelectedElement[]

        if (d.multi) {
          const exists = prev.some((item) => item.id === nextSelection.id)
          nextItems = exists ? prev.filter((item) => item.id !== nextSelection.id) : [...prev, nextSelection]
        } else {
          nextItems = [nextSelection]
        }
        return nextItems
      })
    }

    window.addEventListener("message", handler)
    return () => window.removeEventListener("message", handler)
  }, [enabled, onSelectionChange, onStructureChange])

  const hoverStyle =
    hover && previewSize.w > 0
      ? {
          left: hover.rect.x * (previewSize.w / hover.viewport.w),
          top: hover.rect.y * (previewSize.h / hover.viewport.h),
          width: hover.rect.width * (previewSize.w / hover.viewport.w),
          height: hover.rect.height * (previewSize.h / hover.viewport.h),
        }
      : undefined

  const handleIframeLoad = useCallback(() => {
    if (!iframeRef.current?.contentWindow) return
    try {
      const doc = iframeRef.current.contentDocument
      if (!doc) return

      const script = doc.createElement("script")
      script.textContent = `
        (function() {
          let currentPath = window.location.pathname + window.location.search + window.location.hash;
          const originalPushState = window.history.pushState;
          const originalReplaceState = window.history.replaceState;

          window.history.pushState = function(...args) {
            originalPushState.apply(this, args);
            const newPath = window.location.pathname + window.location.search + window.location.hash;
            if (newPath !== currentPath) {
              currentPath = newPath;
              window.parent.postMessage({ type: 'preview-navigate', path: newPath }, '*');
            }
          };

          window.history.replaceState = function(...args) {
            originalReplaceState.apply(this, args);
            const newPath = window.location.pathname + window.location.search + window.location.hash;
            if (newPath !== currentPath) {
              currentPath = newPath;
              window.parent.postMessage({ type: 'preview-navigate', path: newPath }, '*');
            }
          };

          window.addEventListener('popstate', function() {
            const newPath = window.location.pathname + window.location.search + window.location.hash;
            if (newPath !== currentPath) {
              currentPath = newPath;
              window.parent.postMessage({ type: 'preview-navigate', path: newPath }, '*');
            }
          });
        })();
      `
      doc.head.appendChild(script)
    } catch {
      // Cross-origin iframe, script injection not allowed.
    }
  }, [])

  useEffect(() => {
    if (!externalDraft || !iframeRef.current?.contentWindow) return

    iframeRef.current.contentWindow.postMessage(
      { type: "bstudio-apply-design", id: externalDraft.id, payload: externalDraft.snapshot },
      "*"
    )
  }, [externalDraft])

  useEffect(() => {
    if (!command || !iframeRef.current?.contentWindow) return
    iframeRef.current.contentWindow.postMessage(
      { type: "bstudio-structure-command", command: command.payload },
      "*"
    )
  }, [command])

  return (
    <div className={cn("relative flex w-full min-h-0 flex-1 flex-col", className)}>
      <div ref={previewAreaRef} className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        <iframe
          ref={iframeRef}
          key={iframeKey}
          src={src || undefined}
          className="absolute inset-0 h-full w-full min-h-0 border-0"
          title="Preview"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          onLoad={handleIframeLoad}
        />

        {canEdit && enabled && hover && (
          <div
            className="pointer-events-none absolute z-10 rounded border-2 border-blue-500/70 transition-all duration-75"
            style={hoverStyle}
          />
        )}

        {canEdit && enabled && selectedItems.map((item) => {
          const scaleX = previewSize.w / item.viewport.w
          const scaleY = previewSize.h / item.viewport.h
          return (
            <div
              key={item.id}
              className="absolute z-20 rounded border-2 border-blue-600 bg-blue-500/12 shadow-[0_0_0_1px_rgba(37,99,235,0.14)]"
              style={{
                left: item.rect.x * scaleX,
                top: item.rect.y * scaleY,
                width: item.rect.width * scaleX,
                height: item.rect.height * scaleY,
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
