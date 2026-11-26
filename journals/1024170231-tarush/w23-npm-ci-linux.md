# `npm ci` failed in CI on Linux

## Error

```
npm ci
npm error `npm ci` can only install packages when your package.json and
package-lock.json are in sync.
```

It worked on our Macs but failed on the Ubuntu CI runner.

## Relevant Context

The lockfile had been generated on macOS with a global npm setting
`legacy-peer-deps=true` in `~/.npmrc`.

## Key Observation

With `legacy-peer-deps`, npm leaves optional peer dependencies out of the
lockfile. A clean Linux install without that setting expects them, so the
lockfile looked out of sync.

## Solution

Add a project `.npmrc` with `legacy-peer-deps=false` so every machine resolves
the same way, regenerate `package-lock.json`, and confirm `npm ci` passes in
CI.

**Because** a lockfile is only reproducible if every machine installs with the
same npm settings.
