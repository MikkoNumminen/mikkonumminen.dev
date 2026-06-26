"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Chip,
  CircularProgress,
  Link as MuiLink,
} from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { getBookDetails } from "@/lib/actions";
import { BookDetails } from "@/lib/bookdetails";

interface BookDetailDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  author: string | null;
  coverUrl: string | null;
}

export default function BookDetailDialog({ open, ...props }: BookDetailDialogProps) {
  return (
    <Dialog open={open} onClose={props.onClose} maxWidth="sm" fullWidth>
      {open && <BookDetailContent {...props} />}
    </Dialog>
  );
}

function BookDetailContent({
  onClose,
  title,
  author,
  coverUrl,
}: Omit<BookDetailDialogProps, "open">) {
  const [details, setDetails] = useState<BookDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getBookDetails(title, author).then((d) => {
      if (!cancelled) {
        setDetails(d);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [title, author]);

  return (
    <>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        ) : details ? (
          <Box>
            <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
              {(details.coverUrl || coverUrl) && (
                <Box
                  component="img"
                  src={details.coverUrl || coverUrl || ""}
                  alt={title}
                  sx={{ width: 120, borderRadius: 1, boxShadow: 1, alignSelf: "flex-start" }}
                />
              )}
              <Box>
                {details.authors.length > 0 && (
                  <Typography variant="subtitle1" color="text.secondary">
                    {details.authors.join(", ")}
                  </Typography>
                )}
                {details.publishedDate && (
                  <Typography variant="body2" color="text.secondary">
                    Published: {details.publishedDate}
                  </Typography>
                )}
                {details.publisher && (
                  <Typography variant="body2" color="text.secondary">
                    Publisher: {details.publisher}
                  </Typography>
                )}
                {details.pageCount && (
                  <Typography variant="body2" color="text.secondary">
                    {details.pageCount} pages
                  </Typography>
                )}
                {details.language && (
                  <Typography variant="body2" color="text.secondary">
                    Language: {details.language.toUpperCase()}
                  </Typography>
                )}
              </Box>
            </Box>

            {details.categories.length > 0 && (
              <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mb: 2 }}>
                {details.categories.map((cat) => (
                  <Chip key={cat} label={cat} size="small" variant="outlined" />
                ))}
              </Box>
            )}

            {details.description && (
              <Typography
                variant="body2"
                sx={{ lineHeight: 1.7 }}
                dangerouslySetInnerHTML={{ __html: details.description }}
              />
            )}

            {details.infoLink && (
              <Box sx={{ mt: 2 }}>
                <MuiLink
                  href={details.infoLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
                >
                  More on Google Books <OpenInNewIcon fontSize="small" />
                </MuiLink>
              </Box>
            )}
          </Box>
        ) : (
          <Typography color="text.secondary">No details available for this book.</Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </>
  );
}
