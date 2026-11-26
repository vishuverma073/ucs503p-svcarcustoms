import { Quote, Star } from "lucide-react";

export type CustomerReview = {
  name: string;
  product: string;
  rating: number;
  text: string;
};

/**
 * Customer reviews supplied by the store owner (carried over from the old
 * svcarcustoms.com home page). Add new ones here only from real customers.
 * Deliberately NOT emitted as Review/AggregateRating JSON-LD: Google requires
 * marked-up reviews to be independently collected and shown on the reviewed
 * product's own page.
 */
export const CUSTOMER_REVIEWS: CustomerReview[] = [
  {
    name: "Rohit Saxena",
    product: "Body kit",
    rating: 5,
    text: "Ordered a body kit for my Honda City — the fit was perfect, and the quality exceeded my expectations. Fast delivery too.",
  },
  {
    name: "Priyank Malik",
    product: "Ambient light kit",
    rating: 5,
    text: "Installed the ambient lighting kit and it completely changed the vibe of my car. Easy plug-and-play and looks amazing at night!",
  },
  {
    name: "Nikhil Jain",
    product: "Rear spoiler",
    rating: 5,
    text: "Got a rear spoiler for my Creta. Great finish, very sturdy, and got tons of compliments already. Will order again!",
  },
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export default function CustomerReviews({ reviews = CUSTOMER_REVIEWS }: { reviews?: CustomerReview[] }) {
  if (reviews.length === 0) return null;
  return (
    <section aria-labelledby="customer-reviews-heading" className="bg-brand-black py-14 md:py-20">
      <div className="max-w-380 mx-auto px-4">
        <div className="mb-10 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-orange">Customer stories</p>
          <h2 id="customer-reviews-heading" className="mt-2 text-2xl font-extrabold tracking-tight text-white md:text-4xl">
            What our customers say
          </h2>
          <p className="mt-3 text-sm text-zinc-400 md:text-base">
            Real builds, real drivers — from customers who upgraded with SV Car Customs.
          </p>
        </div>

        <ul className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:px-0">
          {reviews.map((r) => (
            <li
              key={r.name}
              className="relative flex w-[85%] shrink-0 snap-center flex-col rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900 to-zinc-950 p-6 shadow-elevated transition-transform duration-300 hover:-translate-y-1 md:w-auto md:p-8"
            >
              <span aria-hidden className="absolute inset-x-0 top-0 h-1 rounded-t-2xl bg-brand-orange" />
              <Quote aria-hidden size={36} className="text-brand-orange/40" />
              <div className="mt-3 flex gap-1" role="img" aria-label={`Rated ${r.rating} out of 5`}>
                {Array.from({ length: 5 }, (_, i) => (
                  <Star
                    key={i}
                    size={18}
                    className={i < r.rating ? "fill-amber-400 text-amber-400" : "text-zinc-700"}
                  />
                ))}
              </div>
              <blockquote className="mt-4 flex-1 text-base leading-relaxed text-zinc-200 md:text-lg">
                “{r.text}”
              </blockquote>
              <footer className="mt-6 flex items-center gap-3 border-t border-white/10 pt-5">
                <span
                  aria-hidden
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-orange text-sm font-bold text-white"
                >
                  {initials(r.name)}
                </span>
                <span className="min-w-0">
                  <cite className="block font-bold not-italic text-white">{r.name}</cite>
                  <span className="block truncate text-xs text-zinc-400">{r.product}</span>
                </span>
              </footer>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
