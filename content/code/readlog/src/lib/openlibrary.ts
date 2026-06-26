export interface OpenLibraryBook {
  key: string;
  title: string;
  subtitle?: string;
  author_name?: string[];
  first_publish_year?: number;
  number_of_pages_median?: number;
  cover_i?: number;
  isbn?: string[];
}

export interface BookSearchResult {
  openLibraryId: string;
  title: string;
  subtitle: string | null;
  author: string | null;
  firstPublishYear: number | null;
  pageCount: number | null;
  coverUrl: string | null;
}

export async function searchBooks(query: string): Promise<BookSearchResult[]> {
  if (!query.trim()) return [];

  const params = new URLSearchParams({
    q: query,
    limit: "15",
    fields: "key,title,subtitle,author_name,first_publish_year,number_of_pages_median,cover_i",
  });

  const res = await fetch(`https://openlibrary.org/search.json?${params}`);
  if (!res.ok) throw new Error("Open Library API error");

  const data = await res.json();
  const docs: OpenLibraryBook[] = data.docs ?? [];

  return docs.map((doc) => ({
    openLibraryId: doc.key,
    title: doc.title,
    subtitle: doc.subtitle ?? null,
    author: doc.author_name?.[0] ?? null,
    firstPublishYear: doc.first_publish_year ?? null,
    pageCount: doc.number_of_pages_median ?? null,
    coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null,
  }));
}
