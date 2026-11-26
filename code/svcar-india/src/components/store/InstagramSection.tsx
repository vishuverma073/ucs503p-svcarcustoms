import Link from "next/link";
import Image from "next/image";
import { Instagram } from "lucide-react";

const INSTAGRAM_URL =
  process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM || "https://www.instagram.com/svcarcustoms";

/**
 * Real reels from @svcarcustoms, ordered by engagement.
 *
 * Thumbnails are checked into /public/instagram rather than hot-linked: the
 * CDN URLs Instagram hands out are signed and expire, so a linked tile would
 * turn into a broken image within days. Instagram already burns its own play
 * button into the thumbnail, so the tiles don't add one.
 *
 * To refresh: `scripts/fetch-instagram-thumbs.sh <post-url>...` re-downloads
 * the thumbnails, then update this list with the new shortcodes and alts.
 */
const REELS = [
  { code: "DSCE4zOjyxc", alt: "Virtus GT finished with a full set of cosmetic mods" },
  { code: "DP79asLjzni", alt: "Virtus with blacked-out carbon fibre logos and paddle shifter extenders" },
  { code: "DbNa0k8ghiy", alt: "Toyota Fortuner after a round of cosmetic upgrades" },
  { code: "DbpxaFZJ801", alt: "Fortuner with a Legender conversion kit and glossy black PPF" },
  { code: "Db5HJlyOElx", alt: "Skoda Slavia in matte black PPF with a front splitter" },
  { code: "DbIJh6ksH7F", alt: "BMW F30 converted to G20 with our body conversion kit" },
];

export default function InstagramSection() {
  return (
    <section className="max-w-380 mx-auto px-4 py-12 md:py-16">
      <div className="mb-7 text-center">
        <h2 className="text-2xl font-extrabold tracking-tight text-text-primary md:text-3xl">
          Follow us on Instagram
        </h2>
        <p className="mt-2 text-sm text-text-secondary md:text-base">
          Join our community for daily inspiration and a closer look at our builds
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-6">
        {REELS.map((reel) => (
          <Link
            key={reel.code}
            href={`https://www.instagram.com/p/${reel.code}/`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Watch on Instagram: ${reel.alt}`}
            className="group relative aspect-9/16 overflow-hidden rounded-xl bg-brand-black"
          >
            <Image
              src={`/instagram/${reel.code}.jpg`}
              alt={reel.alt}
              fill
              sizes="(min-width: 768px) 17vw, 33vw"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors duration-300 group-hover:bg-black/40">
              <Instagram
                size={22}
                className="text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              />
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-8 text-center">
        <Link
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary mx-auto rounded-full px-7 py-3"
        >
          <Instagram size={18} />
          Visit Instagram
        </Link>
      </div>
    </section>
  );
}
