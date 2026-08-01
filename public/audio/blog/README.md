# Blog narration

Drop narrated blog audio here.

## Filename

```
<slug>-<locale>.mp3
```

`slug` is the shared `slug:` from the post's frontmatter, identical across all
three locales. `locale` is `en`, `fi` or `sv`. So the English narration of
`/blog/ten-days-four-pages` is:

```
ten-days-four-pages-en.mp3
```

The pair is unique per entry, because slug is shared and locale is not.

## Encoding

Match the existing voice files in `public/audio/`:

| | |
| --- | --- |
| Container | MP3 |
| Sample rate | 24 kHz |
| Channels | mono |
| Bitrate | see the note below before using 128 kbps |

`voice-landing-en.mp3` and `voice-projects-en.mp3` are 24 kHz mono at
128 kbps, but they are 29 and 19 seconds long. Blog narration is not: the
fourteen English and Finnish posts run about 63 minutes in total, which at
128 kbps is roughly 60 MB of committed binary against a 34 MB `.git` and an
11 MB `public/`. At 64 kbps the same
audio is about 30 MB and at 48 kbps about 22 MB, both of which are ample for
a mono speech recording. Pick the bitrate deliberately rather than inheriting
128 kbps from two short clips.

There is no Git LFS in this repo. Audio committed here is committed for good,
in every clone and every CI checkout.

## Registering a recording

Adding the file is half the job. The post's frontmatter for that locale must
also flip:

```yaml
hasAudio: true
```

`src/content/blogAudio.test.ts` asserts the two agree, in both directions: a
`hasAudio: true` with no file fails, and a file no entry claims fails. It also
rejects filenames outside the convention above, so a typo in a slug surfaces
as a failed test rather than as a silent 404 in a browser.

## How a recording reaches a visitor

`src/components/blog/BlogVoiceover.astro` renders an `<audio>` element on a
post whose frontmatter says `hasAudio: true`, and nothing at all on a post
that says otherwise. There is no separate player and no second control: the
site's existing sound toggle turns the narration on and off together with the
music bed, the same way the home and projects voices already work.

The narration does not replay when it ends, and it resumes rather than
restarting if the toggle goes off and on partway through. It is not
suppressed by `prefers-reduced-motion`, unlike the other two voices, because
it does not recur and cannot start unless the visitor turned sound on.
