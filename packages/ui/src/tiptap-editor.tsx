import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Mention } from '@tiptap/extension-mention';
import { useEffect, useState } from 'react';
import {
  Bold,
  Italic,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  FileCode,
  Minus,
  Table as TableIcon,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Trash2
} from 'lucide-react';

interface TiptapEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  editable?: boolean;
  className?: string;
  onEditorReady?: (editor: any) => void;
  showToolbar?: boolean;
}

export function TiptapEditor({
  content,
  onChange,
  placeholder = "Type something...",
  editable = true,
  className = "",
  onEditorReady,
  showToolbar = true
}: TiptapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
        bulletList: {
          keepMarks: true,
          keepAttributes: false,
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: false,
        },
        hardBreak: {
          keepMarks: false,
        },
        horizontalRule: true,
        blockquote: true,
        codeBlock: true,
      }),
      Typography,
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Mention.configure({
        HTMLAttributes: {
          class: 'mention',
        },
        suggestion: {
          items: ({ query }) => {
            // Return empty array for now - can be populated with actual users
            return [];
          },
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      // Only update if content actually changed to avoid infinite loops
      if (html !== content) {
        onChange(html);
      }
    },
    editorProps: {
      attributes: {
        class: 'tiptap focus:outline-none px-0 py-2',
      },
    },
  });

  // Update editor content when prop changes (for controlled component)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, false);
    }
  }, [content, editor]);

  // Notify parent when editor is ready
  useEffect(() => {
    if (editor && onEditorReady) {
      onEditorReady(editor);
    }
  }, [editor, onEditorReady]);

  if (!editor) {
    return null;
  }

  const [showTableMenu, setShowTableMenu] = useState(false);

  useEffect(() => {
    if (!editor) return;

    const updateTableMenu = () => {
      setShowTableMenu(editor.isActive('table'));
    };

    editor.on('selectionUpdate', updateTableMenu);
    editor.on('transaction', updateTableMenu);

    return () => {
      editor.off('selectionUpdate', updateTableMenu);
      editor.off('transaction', updateTableMenu);
    };
  }, [editor]);

  return (
    <div className={className || 'border rounded-md bg-background hover:border-ring transition-colors'}>
      <EditorContent editor={editor} />

      {/* Table Manipulation Toolbar - Shows when inside table, above main toolbar */}
      {showToolbar && showTableMenu && editor && editable && (
        <div className="sticky bottom-[41px] z-10 bg-muted/95 backdrop-blur-sm border-t px-2 py-1.5 flex gap-0.5 text-xs flex-wrap items-center">
          <button
            onClick={() => editor.chain().focus().addRowBefore().run()}
            className="p-1.5 hover:bg-accent rounded transition-colors"
            title="Add row before"
          >
            <ChevronUp size={16} />
          </button>
          <button
            onClick={() => editor.chain().focus().addRowAfter().run()}
            className="p-1.5 hover:bg-accent rounded transition-colors"
            title="Add row after"
          >
            <ChevronDown size={16} />
          </button>
          <button
            onClick={() => editor.chain().focus().deleteRow().run()}
            className="p-1.5 hover:bg-destructive/10 text-destructive rounded transition-colors"
            title="Delete row"
          >
            <Trash2 size={16} />
          </button>
          <div className="w-px bg-border h-4 mx-1" />
          <button
            onClick={() => editor.chain().focus().addColumnBefore().run()}
            className="p-1.5 hover:bg-accent rounded transition-colors"
            title="Add column before"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => editor.chain().focus().addColumnAfter().run()}
            className="p-1.5 hover:bg-accent rounded transition-colors"
            title="Add column after"
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={() => editor.chain().focus().deleteColumn().run()}
            className="p-1.5 hover:bg-destructive/10 text-destructive rounded transition-colors"
            title="Delete column"
          >
            <Trash2 size={16} />
          </button>
          <div className="w-px bg-border h-4 mx-1" />
          <button
            onClick={() => editor.chain().focus().deleteTable().run()}
            className="p-1.5 hover:bg-destructive/10 text-destructive rounded transition-colors"
            title="Delete table"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}

      {/* Main Toolbar - Bottom navigation style */}
      {showToolbar && editable && (
        <div className="sticky bottom-0 z-10 bg-background/95 backdrop-blur-sm border-t px-2 py-1.5 flex gap-0.5 text-xs flex-wrap items-center">
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-1.5 hover:bg-accent rounded transition-colors ${editor.isActive('bold') ? 'bg-accent' : ''}`}
            title="Bold"
          >
            <Bold size={16} />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-1.5 hover:bg-accent rounded transition-colors ${editor.isActive('italic') ? 'bg-accent' : ''}`}
            title="Italic"
          >
            <Italic size={16} />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleCode().run()}
            className={`p-1.5 hover:bg-accent rounded transition-colors ${editor.isActive('code') ? 'bg-accent' : ''}`}
            title="Inline code"
          >
            <Code size={16} />
          </button>
          <div className="w-px bg-border h-4 mx-1" />
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={`p-1.5 hover:bg-accent rounded transition-colors ${editor.isActive('heading', { level: 1 }) ? 'bg-accent' : ''}`}
            title="Heading 1"
          >
            <Heading1 size={16} />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`p-1.5 hover:bg-accent rounded transition-colors ${editor.isActive('heading', { level: 2 }) ? 'bg-accent' : ''}`}
            title="Heading 2"
          >
            <Heading2 size={16} />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={`p-1.5 hover:bg-accent rounded transition-colors ${editor.isActive('heading', { level: 3 }) ? 'bg-accent' : ''}`}
            title="Heading 3"
          >
            <Heading3 size={16} />
          </button>
          <div className="w-px bg-border h-4 mx-1" />
          <button
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`p-1.5 hover:bg-accent rounded transition-colors ${editor.isActive('bulletList') ? 'bg-accent' : ''}`}
            title="Bullet list"
          >
            <List size={16} />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`p-1.5 hover:bg-accent rounded transition-colors ${editor.isActive('orderedList') ? 'bg-accent' : ''}`}
            title="Numbered list"
          >
            <ListOrdered size={16} />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            className={`p-1.5 hover:bg-accent rounded transition-colors ${editor.isActive('taskList') ? 'bg-accent' : ''}`}
            title="Task list"
          >
            <CheckSquare size={16} />
          </button>
          <div className="w-px bg-border h-4 mx-1" />
          <button
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={`p-1.5 hover:bg-accent rounded transition-colors ${editor.isActive('blockquote') ? 'bg-accent' : ''}`}
            title="Blockquote"
          >
            <Quote size={16} />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            className={`p-1.5 hover:bg-accent rounded transition-colors ${editor.isActive('codeBlock') ? 'bg-accent' : ''}`}
            title="Code block"
          >
            <FileCode size={16} />
          </button>
          <button
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            className="p-1.5 hover:bg-accent rounded transition-colors"
            title="Horizontal rule"
          >
            <Minus size={16} />
          </button>
          <div className="w-px bg-border h-4 mx-1" />
          <button
            onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            className="p-1.5 hover:bg-accent rounded transition-colors"
            title="Insert table"
          >
            <TableIcon size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

// Standalone Toolbar Component for external use
interface EditorToolbarProps {
  editor: any;
  showTableMenu?: boolean;
}

export function EditorToolbar({ editor, showTableMenu = false }: EditorToolbarProps) {
  if (!editor) return null;

  return (
    <>
      {/* Table Manipulation Toolbar - Shows when inside table, above main toolbar */}
      {showTableMenu && (
        <div className="bg-muted/95 backdrop-blur-sm border-t px-2 py-1.5 flex gap-0.5 text-xs flex-wrap items-center">
          <button
            onClick={() => editor.chain().focus().addRowBefore().run()}
            className="p-1.5 hover:bg-accent rounded transition-colors"
            title="Add row before"
          >
            <ChevronUp size={16} />
          </button>
          <button
            onClick={() => editor.chain().focus().addRowAfter().run()}
            className="p-1.5 hover:bg-accent rounded transition-colors"
            title="Add row after"
          >
            <ChevronDown size={16} />
          </button>
          <button
            onClick={() => editor.chain().focus().deleteRow().run()}
            className="p-1.5 hover:bg-destructive/10 text-destructive rounded transition-colors"
            title="Delete row"
          >
            <Trash2 size={16} />
          </button>
          <div className="w-px bg-border h-4 mx-1" />
          <button
            onClick={() => editor.chain().focus().addColumnBefore().run()}
            className="p-1.5 hover:bg-accent rounded transition-colors"
            title="Add column before"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => editor.chain().focus().addColumnAfter().run()}
            className="p-1.5 hover:bg-accent rounded transition-colors"
            title="Add column after"
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={() => editor.chain().focus().deleteColumn().run()}
            className="p-1.5 hover:bg-destructive/10 text-destructive rounded transition-colors"
            title="Delete column"
          >
            <Trash2 size={16} />
          </button>
          <div className="w-px bg-border h-4 mx-1" />
          <button
            onClick={() => editor.chain().focus().deleteTable().run()}
            className="p-1.5 hover:bg-destructive/10 text-destructive rounded transition-colors"
            title="Delete table"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}

      {/* Main Toolbar */}
      <div className="bg-background/95 backdrop-blur-sm border-t px-2 py-1.5 flex gap-0.5 text-xs flex-wrap items-center">
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`p-1.5 hover:bg-accent rounded transition-colors ${editor.isActive('bold') ? 'bg-accent' : ''}`}
          title="Bold"
        >
          <Bold size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`p-1.5 hover:bg-accent rounded transition-colors ${editor.isActive('italic') ? 'bg-accent' : ''}`}
          title="Italic"
        >
          <Italic size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleCode().run()}
          className={`p-1.5 hover:bg-accent rounded transition-colors ${editor.isActive('code') ? 'bg-accent' : ''}`}
          title="Inline code"
        >
          <Code size={16} />
        </button>
        <div className="w-px bg-border h-4 mx-1" />
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={`p-1.5 hover:bg-accent rounded transition-colors ${editor.isActive('heading', { level: 1 }) ? 'bg-accent' : ''}`}
          title="Heading 1"
        >
          <Heading1 size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`p-1.5 hover:bg-accent rounded transition-colors ${editor.isActive('heading', { level: 2 }) ? 'bg-accent' : ''}`}
          title="Heading 2"
        >
          <Heading2 size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={`p-1.5 hover:bg-accent rounded transition-colors ${editor.isActive('heading', { level: 3 }) ? 'bg-accent' : ''}`}
          title="Heading 3"
        >
          <Heading3 size={16} />
        </button>
        <div className="w-px bg-border h-4 mx-1" />
        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`p-1.5 hover:bg-accent rounded transition-colors ${editor.isActive('bulletList') ? 'bg-accent' : ''}`}
          title="Bullet list"
        >
          <List size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`p-1.5 hover:bg-accent rounded transition-colors ${editor.isActive('orderedList') ? 'bg-accent' : ''}`}
          title="Numbered list"
        >
          <ListOrdered size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          className={`p-1.5 hover:bg-accent rounded transition-colors ${editor.isActive('taskList') ? 'bg-accent' : ''}`}
          title="Task list"
        >
          <CheckSquare size={16} />
        </button>
        <div className="w-px bg-border h-4 mx-1" />
        <button
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={`p-1.5 hover:bg-accent rounded transition-colors ${editor.isActive('blockquote') ? 'bg-accent' : ''}`}
          title="Blockquote"
        >
          <Quote size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className={`p-1.5 hover:bg-accent rounded transition-colors ${editor.isActive('codeBlock') ? 'bg-accent' : ''}`}
          title="Code block"
        >
          <FileCode size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          className="p-1.5 hover:bg-accent rounded transition-colors"
          title="Horizontal rule"
        >
          <Minus size={16} />
        </button>
        <div className="w-px bg-border h-4 mx-1" />
        <button
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          className="p-1.5 hover:bg-accent rounded transition-colors"
          title="Insert table"
        >
          <TableIcon size={16} />
        </button>
      </div>
    </>
  );
}
