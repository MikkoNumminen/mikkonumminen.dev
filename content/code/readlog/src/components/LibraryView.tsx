"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardMedia,
  Chip,
  IconButton,
  Tooltip,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  ToggleButtonGroup,
  ToggleButton,
  Rating,
} from "@mui/material";
import GridViewIcon from "@mui/icons-material/GridView";
import ViewListIcon from "@mui/icons-material/ViewList";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import HeadphonesIcon from "@mui/icons-material/Headphones";
import TabletIcon from "@mui/icons-material/Tablet";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import { updateReadEntry, deleteReadEntry } from "@/lib/actions";

const formatIcons = {
  BOOK: <MenuBookIcon fontSize="small" />,
  AUDIOBOOK: <HeadphonesIcon fontSize="small" />,
  EBOOK: <TabletIcon fontSize="small" />,
};

type FormatType = "BOOK" | "AUDIOBOOK" | "EBOOK";

interface ReadEntry {
  id: string;
  format: FormatType;
  finishedAt: string | Date;
  rating?: number | null;
  book: {
    title: string;
    author: string | null;
    coverUrl: string | null;
  };
}

export default function LibraryView({ entries }: { entries: ReadEntry[] }) {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [editing, setEditing] = useState<ReadEntry | null>(null);

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
        <Tooltip title="Grid view">
          <IconButton
            size="small"
            onClick={() => setView("grid")}
            color={view === "grid" ? "primary" : "default"}
          >
            <GridViewIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="List view">
          <IconButton
            size="small"
            onClick={() => setView("list")}
            color={view === "list" ? "primary" : "default"}
          >
            <ViewListIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {view === "grid" ? (
        <GridView entries={entries} onEdit={setEditing} />
      ) : (
        <ListView entries={entries} onEdit={setEditing} />
      )}

      {editing && <EditDialog entry={editing} onClose={() => setEditing(null)} />}
    </Box>
  );
}

function GridView({
  entries,
  onEdit,
}: {
  entries: ReadEntry[];
  onEdit: (entry: ReadEntry) => void;
}) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "repeat(3, 1fr)",
          sm: "repeat(4, 1fr)",
          md: "repeat(5, 1fr)",
        },
        gap: 2,
      }}
    >
      {entries.map((entry) => (
        <Box
          key={entry.id}
          sx={{ textAlign: "center", cursor: "pointer" }}
          onClick={() => onEdit(entry)}
        >
          {entry.book.coverUrl ? (
            <Box
              component="img"
              src={entry.book.coverUrl}
              alt={entry.book.title}
              sx={{
                width: "100%",
                aspectRatio: "2/3",
                objectFit: "cover",
                borderRadius: 1,
                boxShadow: 1,
              }}
            />
          ) : (
            <Box
              sx={{
                width: "100%",
                aspectRatio: "2/3",
                borderRadius: 1,
                bgcolor: "grey.100",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MenuBookIcon sx={{ fontSize: 48, color: "grey.400" }} />
            </Box>
          )}
          <Typography
            variant="body2"
            fontWeight={600}
            sx={{
              mt: 0.5,
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {entry.book.title}
          </Typography>
          {entry.book.author && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                display: "block",
              }}
            >
              {entry.book.author}
            </Typography>
          )}
          {entry.rating != null && (
            <Box sx={{ display: "flex", justifyContent: "center", mt: 0.5 }}>
              <Rating value={entry.rating} readOnly size="small" />
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}

function ListView({
  entries,
  onEdit,
}: {
  entries: ReadEntry[];
  onEdit: (entry: ReadEntry) => void;
}) {
  return (
    <Stack spacing={0.5}>
      {entries.map((entry) => (
        <Card key={entry.id} variant="outlined" sx={{ display: "flex", alignItems: "center" }}>
          {entry.book.coverUrl ? (
            <CardMedia
              component="img"
              sx={{ width: 40, height: 60, objectFit: "cover", flexShrink: 0 }}
              image={entry.book.coverUrl}
              alt={entry.book.title}
            />
          ) : (
            <Box
              sx={{
                width: 40,
                height: 60,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: "grey.100",
                flexShrink: 0,
              }}
            >
              <MenuBookIcon sx={{ fontSize: 24, color: "grey.400" }} />
            </Box>
          )}
          <CardContent
            sx={{
              py: 0.5,
              px: 1.5,
              "&:last-child": { pb: 0.5 },
              flex: 1,
              minWidth: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 1,
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" fontWeight={600} noWrap>
                {entry.book.title}
              </Typography>
              {entry.book.author && (
                <Typography variant="caption" color="text.secondary" noWrap component="div">
                  {entry.book.author}
                </Typography>
              )}
              {entry.rating != null && <Rating value={entry.rating} readOnly size="small" />}
            </Box>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexShrink: 0 }}>
              <Chip
                icon={formatIcons[entry.format]}
                label={entry.format.toLowerCase()}
                size="small"
                variant="outlined"
              />
              <Typography variant="caption" color="text.secondary" noWrap>
                {new Date(entry.finishedAt).toLocaleDateString()}
              </Typography>
              <IconButton size="small" onClick={() => onEdit(entry)}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Box>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}

function EditDialog({ entry, onClose }: { entry: ReadEntry; onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(entry.book.title);
  const [format, setFormat] = useState<FormatType>(entry.format);
  const [finishedAt, setFinishedAt] = useState(
    new Date(entry.finishedAt).toISOString().split("T")[0],
  );
  const [rating, setRating] = useState<number | null>(entry.rating ?? null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const hasChanges =
    title !== entry.book.title ||
    format !== entry.format ||
    finishedAt !== new Date(entry.finishedAt).toISOString().split("T")[0] ||
    rating !== (entry.rating ?? null);

  const handleSave = async () => {
    if (!hasChanges) {
      onClose();
      return;
    }
    setSaving(true);
    await updateReadEntry(entry.id, {
      ...(title !== entry.book.title && { title }),
      ...(format !== entry.format && { format }),
      ...(finishedAt !== new Date(entry.finishedAt).toISOString().split("T")[0] && { finishedAt }),
      ...(rating !== (entry.rating ?? null) && { rating }),
    });
    router.refresh();
    onClose();
  };

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Edit entry</DialogTitle>
      <DialogContent>
        <TextField
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          fullWidth
          sx={{ mt: 1, mb: 2 }}
        />
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Format
        </Typography>
        <ToggleButtonGroup
          value={format}
          exclusive
          onChange={(_, v) => v && setFormat(v)}
          fullWidth
          sx={{ mb: 2 }}
        >
          <ToggleButton value="BOOK">
            <MenuBookIcon sx={{ mr: 0.5 }} fontSize="small" /> Book
          </ToggleButton>
          <ToggleButton value="AUDIOBOOK">
            <HeadphonesIcon sx={{ mr: 0.5 }} fontSize="small" /> Audiobook
          </ToggleButton>
          <ToggleButton value="EBOOK">
            <TabletIcon sx={{ mr: 0.5 }} fontSize="small" /> E-book
          </ToggleButton>
        </ToggleButtonGroup>
        <TextField
          label="Finished on"
          type="date"
          value={finishedAt}
          onChange={(e) => setFinishedAt(e.target.value)}
          fullWidth
          sx={{ mb: 2 }}
        />
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Rating
        </Typography>
        <Rating value={rating} onChange={(_, v) => setRating(v)} size="large" />
      </DialogContent>
      <DialogActions sx={{ justifyContent: "space-between" }}>
        {confirmDelete ? (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="body2" color="error">
              Delete this entry?
            </Typography>
            <Button
              color="error"
              size="small"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                await deleteReadEntry(entry.id);
                router.refresh();
                onClose();
              }}
            >
              Yes, delete
            </Button>
            <Button size="small" onClick={() => setConfirmDelete(false)}>
              No
            </Button>
          </Box>
        ) : (
          <IconButton color="error" size="small" onClick={() => setConfirmDelete(true)}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        )}
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} variant="contained" disabled={saving || !hasChanges}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}
