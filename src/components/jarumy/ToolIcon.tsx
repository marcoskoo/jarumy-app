'use client'

import {
  Home, FilePlus2, Save, FileDown, Printer, Undo2, Redo2, PanelRight, Library,
  PencilRuler, Minus, Spline, Circle, Square, TrendingUp, CircleDashed, Dot, Grid2x2,
  Wrench, Move, Copy, RotateCw, Maximize2, FlipHorizontal2, MoveHorizontal, Scissors, Expand,
  LayoutGrid, StretchHorizontal, Ungroup, Paintbrush, Trash2,
  Ruler, Compass, CircleDot, Type, CornerDownRight, Table, Cloud,
  Building2, BrickWall, DoorOpen, AppWindow, ArrowUpNarrowWide, Layers, Columns3, Grid3x3,
  Blocks, Armchair, Bath, CookingPot, Shapes,
  Boxes, ClipboardList, AlertTriangle, Zap, History, Users, Component,
  Eye, Box, Footprints, Sun, Palette, Sparkles,
  Activity, SquareSigma, Lightbulb, Landmark, AudioWaveform,
  Rocket, ShieldCheck, MousePointerClick,
  Settings2, Replace, Hash, RefreshCw, Pencil, AlignLeft, Tag, Tags, PaintBucket,
  PenLine, Frame, Scaling, X, ChevronLeft, Info, Lock, EyeOff,
  TreePine, Play, Pause,
} from 'lucide-react'

const ICONS: Record<string, React.ComponentType<{ className?: string; size?: number; strokeWidth?: number }>> = {
  Home, FilePlus2, Save, FileDown, Printer, Undo2, Redo2, PanelRight, Library,
  PencilRuler, Minus, Spline, Circle, Square, TrendingUp, CircleDashed, Dot, Grid2x2,
  Wrench, Move, Copy, RotateCw, Maximize2, FlipHorizontal2, MoveHorizontal, Scissors, Expand,
  LayoutGrid, StretchHorizontal, Ungroup, Paintbrush, Trash2,
  Ruler, Compass, CircleDot, Type, CornerDownRight, Table, Cloud,
  Building2, BrickWall, DoorOpen, AppWindow, ArrowUpNarrowWide, Layers, Columns3, Grid3x3,
  Blocks, Armchair, Bath, CookingPot, Shapes,
  Boxes, ClipboardList, AlertTriangle, Zap, History, Users, Component,
  Eye, Box, Footprints, Sun, Palette, Sparkles,
  Activity, SquareSigma, Lightbulb, Landmark, AudioWaveform,
  Rocket, ShieldCheck, MousePointerClick,
  Settings2, Replace, Hash, RefreshCw, Pencil, AlignLeft, Tag, Tags, PaintBucket,
  PenLine, Frame, Scaling, X, ChevronLeft, Info, Lock, EyeOff,
  TreePine, Play, Pause,
}

export function ToolIcon({ name, className, size = 16 }: { name: string; className?: string; size?: number }) {
  const Icon = ICONS[name] || Info
  return <Icon className={className} size={size} strokeWidth={1.9} />
}

// Icono por tipo de elemento del plano
export const TYPE_ICON: Record<string, string> = {
  muro: 'BrickWall',
  puerta: 'DoorOpen',
  ventana: 'AppWindow',
  espacio: 'LayoutGrid',
  mobiliario: 'Armchair',
  sanitario: 'Bath',
  cota: 'Ruler',
  texto: 'Type',
  columna: 'Columns3',
  apertura: 'DoorOpen',
  dibujo: 'PenLine',
  lamina: 'Frame',
}

export const TYPE_LABEL: Record<string, string> = {
  muro: 'MURO',
  puerta: 'PUERTA',
  ventana: 'VENTANA',
  espacio: 'ESPACIO',
  mobiliario: 'MOBILIARIO',
  sanitario: 'SANITARIO',
  cota: 'COTA',
  texto: 'TEXTO',
  columna: 'COLUMNA',
  apertura: 'VANO',
  dibujo: 'DIBUJO',
  lamina: 'LÁMINA',
}
