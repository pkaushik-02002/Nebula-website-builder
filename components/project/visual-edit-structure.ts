"use client"

export type VisualEditSectionKind = "header" | "hero" | "content" | "cta" | "footer" | "generic"

export interface VisualEditSectionItem {
  id: string
  label: string
  kind: VisualEditSectionKind
  index: number
}

export type VisualEditStructureCommand =
  | { type: "select-section"; sectionId: string }
  | { type: "move-section"; sectionId: string; direction: "up" | "down" }
  | { type: "reorder-section"; sectionId: string; toIndex: number }
  | { type: "duplicate-section"; sectionId: string }
  | { type: "delete-section"; sectionId: string }
  | { type: "insert-section"; afterSectionId: string | null; variant: "blank" | "hero" | "features" | "cta" }

