"use client";

import { useState, useCallback } from "react";
import {
  TextField,
  List,
  ListItemButton,
  ListItemAvatar,
  ListItemText,
  Avatar,
  CircularProgress,
  Typography,
  Box,
  Stack,
  Button,
} from "@mui/material";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import { searchBooksAction } from "@/lib/actions";
import { BookSearchResult } from "@/lib/openlibrary";

const INITIAL_SHOW = 10;

interface BookSearchProps {
  onSelect: (book: BookSearchResult) => void;
}

export default function BookSearch({ onSelect }: BookSearchProps) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [results, setResults] = useState<BookSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const handleSearch = useCallback(async () => {
    const query = [title.trim(), author.trim()].filter(Boolean).join(" ");
    if (!query) return;
    setLoading(true);
    setSearched(true);
    setShowAll(false);
    try {
      const books = await searchBooksAction(query);
      setResults(books);
    } finally {
      setLoading(false);
    }
  }, [title, author]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const visibleResults = showAll ? results : results.slice(0, INITIAL_SHOW);
  const hasMore = results.length > INITIAL_SHOW && !showAll;

  return (
    <Box>
      <Stack spacing={2}>
        <TextField
          fullWidth
          label="Book title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          slotProps={{
            input: {
              endAdornment: loading ? <CircularProgress size={20} /> : null,
            },
          }}
        />
        <TextField
          fullWidth
          label="Author (optional)"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          onKeyDown={handleKeyDown}
          size="small"
        />
      </Stack>

      {searched && results.length === 0 && !loading && (
        <Box sx={{ mt: 2 }}>
          <Typography color="text.secondary" gutterBottom>
            No books found.
          </Typography>
          <Button
            variant="outlined"
            onClick={() =>
              onSelect({
                openLibraryId: `manual:${Date.now()}`,
                title: title.trim(),
                subtitle: null,
                author: author.trim() || null,
                firstPublishYear: null,
                pageCount: null,
                coverUrl: null,
              })
            }
          >
            Add &quot;{title.trim()}&quot; manually
          </Button>
        </Box>
      )}

      <List>
        {visibleResults.map((book) => (
          <ListItemButton key={book.openLibraryId} onClick={() => onSelect(book)}>
            <ListItemAvatar>
              {book.coverUrl ? (
                <Avatar variant="rounded" src={book.coverUrl} sx={{ width: 40, height: 56 }} />
              ) : (
                <Avatar variant="rounded" sx={{ width: 40, height: 56 }}>
                  <MenuBookIcon />
                </Avatar>
              )}
            </ListItemAvatar>
            <ListItemText
              primary={book.subtitle ? `${book.title} — ${book.subtitle}` : book.title}
              secondary={[book.author, book.firstPublishYear].filter(Boolean).join(" · ")}
            />
          </ListItemButton>
        ))}
      </List>

      {hasMore && (
        <Button fullWidth onClick={() => setShowAll(true)}>
          Show {results.length - INITIAL_SHOW} more results
        </Button>
      )}
    </Box>
  );
}
