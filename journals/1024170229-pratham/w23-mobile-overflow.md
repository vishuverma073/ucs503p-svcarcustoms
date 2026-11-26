# Phone layout wider than the screen

## Error

On phones the home page scrolled sideways; the page was 657 px wide on a
390 px screen.

## Relevant Context

The hero banner used a CSS grid with two columns and long, unbreakable text
in one column.

## Key Observation

Grid and flex children default to `min-width: auto`, so they refuse to shrink
below their content's width. The long text forced the column, and the whole
page, wider than the screen.

## Solution

Use a single column on small screens (`grid-cols-1`), add `min-w-0` to the
grid children so they can shrink, and `break-words` so long words wrap. The
same fix was applied to the category title box.

**Because** `min-width: 0` lets a grid or flex item shrink below its content
width.
