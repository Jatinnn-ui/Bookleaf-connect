import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Prisma, type PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";

/**
 * Seeds the supplied bookleaf_sample_data.json exactly as given.
 * - Validated with Zod before any write.
 * - Idempotent: upserts keyed on email / externalAuthorId / externalBookId.
 * - Royalty figures are copied verbatim, never recomputed.
 */
const isoDate = z.iso.date();
const money = z.number().nonnegative();

const bookSchema = z.object({
  book_id: z.string().min(1),
  title: z.string().min(1),
  isbn: z.string().min(1),
  genre: z.string().min(1),
  publication_date: isoDate.nullable(),
  status: z.string().min(1),
  mrp: money.nullable(),
  author_royalty_per_copy: money.nullable(),
  total_copies_sold: z.number().int().nonnegative(),
  total_royalty_earned: money,
  royalty_paid: money,
  royalty_pending: money,
  last_royalty_payout_date: isoDate.nullable(),
  print_partner: z.string().nullable(),
  available_on: z.array(z.string()),
});

const authorSchema = z.object({
  author_id: z.string().min(1),
  name: z.string().min(1),
  email: z.email(),
  phone: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  joined_date: isoDate,
  books: z.array(bookSchema),
});

export const sampleDataSchema = z.object({ authors: z.array(authorSchema).min(1) });
export type SampleData = z.infer<typeof sampleDataSchema>;

export const DEFAULT_DATA_PATH = resolve(process.cwd(), "bookleaf_sample_data.json");

export function loadSampleData(path = process.env.SEED_DATA_PATH || DEFAULT_DATA_PATH): SampleData {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(`Sample data not found at ${path}. Place bookleaf_sample_data.json in the project root or set SEED_DATA_PATH.`);
  }
  return sampleDataSchema.parse(JSON.parse(raw));
}

const d = (s: string | null) => (s ? new Date(`${s}T00:00:00.000Z`) : null);
const dec = (n: number | null) => (n === null ? null : new Prisma.Decimal(n));

export type SeedOptions = {
  demoPassword: string;
  admin: { email: string; password: string; name: string };
  resetPasswords?: boolean;
};

export async function seed(prisma: PrismaClient, data: SampleData, opts: SeedOptions) {
  const [authorHash, adminHash] = await Promise.all([
    bcrypt.hash(opts.demoPassword, 12),
    bcrypt.hash(opts.admin.password, 12),
  ]);

  await prisma.$transaction(
    async (tx) => {
      await tx.user.upsert({
        where: { email: opts.admin.email.toLowerCase() },
        create: { email: opts.admin.email.toLowerCase(), name: opts.admin.name, role: "ADMIN", passwordHash: adminHash },
        update: { name: opts.admin.name, role: "ADMIN", ...(opts.resetPasswords ? { passwordHash: adminHash } : {}) },
      });

      for (const a of data.authors) {
        const email = a.email.trim().toLowerCase();
        const user = await tx.user.upsert({
          where: { email },
          create: { email, name: a.name, role: "AUTHOR", passwordHash: authorHash },
          update: { name: a.name, ...(opts.resetPasswords ? { passwordHash: authorHash } : {}) },
        });
        const author = await tx.author.upsert({
          where: { externalAuthorId: a.author_id },
          create: { externalAuthorId: a.author_id, userId: user.id, phone: a.phone ?? null, city: a.city ?? null, joinedDate: d(a.joined_date)! },
          update: { userId: user.id, phone: a.phone ?? null, city: a.city ?? null, joinedDate: d(a.joined_date)! },
        });
        for (const b of a.books) {
          const fields = {
            authorId: author.id,
            title: b.title,
            isbn: b.isbn,
            genre: b.genre,
            publicationDate: d(b.publication_date),
            status: b.status,
            mrp: dec(b.mrp),
            authorRoyaltyPerCopy: dec(b.author_royalty_per_copy),
            totalCopiesSold: b.total_copies_sold,
            totalRoyaltyEarned: dec(b.total_royalty_earned)!,
            royaltyPaid: dec(b.royalty_paid)!,
            royaltyPending: dec(b.royalty_pending)!,
            lastRoyaltyPayoutDate: d(b.last_royalty_payout_date),
            printPartner: b.print_partner,
            availableOn: b.available_on,
          };
          await tx.book.upsert({
            where: { externalBookId: b.book_id },
            create: { externalBookId: b.book_id, ...fields },
            update: fields,
          });
        }
      }
    },
    { timeout: 60_000 },
  );

  // Verify what we expect is actually there.
  const expectedAuthors = data.authors.map((a) => a.author_id);
  const expectedBooks = data.authors.flatMap((a) => a.books.map((b) => b.book_id));
  const [authors, books] = await Promise.all([
    prisma.author.count({ where: { externalAuthorId: { in: expectedAuthors } } }),
    prisma.book.count({ where: { externalBookId: { in: expectedBooks } } }),
  ]);
  if (authors !== expectedAuthors.length || books !== expectedBooks.length) {
    throw new Error(`Seed verification failed: ${authors}/${expectedAuthors.length} authors, ${books}/${expectedBooks.length} books`);
  }
  return { authors, books };
}
