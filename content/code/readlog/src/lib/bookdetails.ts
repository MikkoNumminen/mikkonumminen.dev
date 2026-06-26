export interface BookDetails {
  title: string;
  authors: string[];
  description: string | null;
  categories: string[];
  publisher: string | null;
  publishedDate: string | null;
  pageCount: number | null;
  coverUrl: string | null;
  language: string | null;
  previewLink: string | null;
  infoLink: string | null;
}

export async function fetchBookDetails(
  title: string,
  author: string | null,
): Promise<BookDetails | null> {
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  if (!apiKey) return null;

  const query = [title, author].filter(Boolean).join(" ");
  const params = new URLSearchParams({
    q: query,
    maxResults: "1",
    key: apiKey,
  });

  const res = await fetch(`https://www.googleapis.com/books/v1/volumes?${params}`);
  if (!res.ok) return null;

  const data = await res.json();
  const item = data.items?.[0];
  if (!item) return null;

  const v = item.volumeInfo;
  return {
    title: v.title ?? title,
    authors: v.authors ?? (author ? [author] : []),
    description: v.description ?? null,
    categories: v.categories ?? [],
    publisher: v.publisher ?? null,
    publishedDate: v.publishedDate ?? null,
    pageCount: v.pageCount ?? null,
    coverUrl: v.imageLinks?.thumbnail?.replace("http:", "https:") ?? null,
    language: v.language ?? null,
    previewLink: v.previewLink ?? null,
    infoLink: v.infoLink ?? null,
  };
}
