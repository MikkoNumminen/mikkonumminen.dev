import { BookSearchResult } from "@/lib/openlibrary";

interface GoogleBooksVolume {
  id: string;
  volumeInfo: {
    title: string;
    subtitle?: string;
    authors?: string[];
    publishedDate?: string;
    pageCount?: number;
    imageLinks?: {
      thumbnail?: string;
      smallThumbnail?: string;
    };
    industryIdentifiers?: { type: string; identifier: string }[];
    seriesInfo?: {
      bookDisplayNumber?: string;
    };
  };
}

export async function searchGoogleBooks(query: string): Promise<BookSearchResult[]> {
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  if (!apiKey || !query.trim()) return [];

  const params = new URLSearchParams({
    q: query,
    maxResults: "15",
    key: apiKey,
  });

  const res = await fetch(`https://www.googleapis.com/books/v1/volumes?${params}`);
  if (!res.ok) return [];

  const data = await res.json();
  const items: GoogleBooksVolume[] = data.items ?? [];

  return items.map((item) => {
    const v = item.volumeInfo;
    let subtitle = v.subtitle ?? null;

    // If seriesInfo exists, build a series label
    if (v.seriesInfo?.bookDisplayNumber) {
      subtitle = `Book ${v.seriesInfo.bookDisplayNumber}${subtitle ? ` — ${subtitle}` : ""}`;
    }

    return {
      openLibraryId: `google:${item.id}`,
      title: v.title,
      subtitle,
      author: v.authors?.[0] ?? null,
      firstPublishYear: v.publishedDate ? parseInt(v.publishedDate.slice(0, 4), 10) || null : null,
      pageCount: v.pageCount ?? null,
      coverUrl: v.imageLinks?.thumbnail?.replace("http:", "https:") ?? null,
    };
  });
}
