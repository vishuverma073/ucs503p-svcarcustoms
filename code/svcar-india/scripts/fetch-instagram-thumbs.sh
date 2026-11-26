#!/usr/bin/env bash
# Download reel/post thumbnails for the home page Instagram section.
#
#   ./scripts/fetch-instagram-thumbs.sh https://www.instagram.com/p/ABC123/ ...
#
# Saves each one to public/instagram/<shortcode>.jpg, then print the shortcodes
# into the REELS list in src/components/store/InstagramSection.tsx.
#
# Instagram serves a logged-out browser a login wall, but still hands the
# og:image to link-preview crawlers — hence the facebookexternalhit UA. The
# CDN URL it returns is signed and expires, so the file has to be saved
# locally instead of hot-linked. 640px is the largest size the signature
# covers; asking for s1080x1080 gets a 403.
set -euo pipefail

UA="facebookexternalhit/1.1"
DEST="$(cd "$(dirname "$0")/.." && pwd)/public/instagram"

if [ $# -eq 0 ]; then
  echo "usage: $0 <instagram-post-url>..." >&2
  exit 1
fi

mkdir -p "$DEST"

for url in "$@"; do
  code="$(printf '%s' "$url" | sed -E 's#.*/(p|reel)/([^/?]+).*#\2#')"
  if [ -z "$code" ] || [ "$code" = "$url" ]; then
    echo "skip: could not read a shortcode out of $url" >&2
    continue
  fi

  img="$(curl -sL -A "$UA" "https://www.instagram.com/p/$code/" \
    | grep -o 'property="og:image" content="[^"]*"' \
    | head -1 | sed -E 's/.*content="([^"]*)".*/\1/' | sed 's/\&amp;/\&/g')"

  if [ -z "$img" ]; then
    echo "fail: no og:image for $code (private, deleted, or rate-limited)" >&2
    continue
  fi

  curl -sL -A "$UA" "$img" -o "$DEST/$code.jpg"
  echo "ok: $code -> public/instagram/$code.jpg ($(wc -c <"$DEST/$code.jpg" | tr -d ' ') bytes)"
done
