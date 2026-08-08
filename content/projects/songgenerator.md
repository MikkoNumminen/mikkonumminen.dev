---
title: SongGenerator · replace a song's vocal with a bank of sung word clips
project: songgenerator
url: https://github.com/MikkoNumminen/SongGenerator
---

# SongGenerator

**Takes a song, throws away the singer, and puts a small bank of sung word clips back in their place, on the same notes, at the same moments.**

It runs entirely locally on one GPU. No cloud, no paid services, and no vocal synthesis: the words are real recordings, and the tool only separates, analyses, re-pitches, re-times and mixes them.

One command writes fourteen versions of a song. Two arrangements of the words, one tidy and one that mixes them up harder, each rendered across seven settings from words that ignore the tune completely through to words that sing it as closely as the song allows. Which one is best varies by song, so the tool renders the sweep and you pick by ear.

## The central idea

Every musical decision is stolen from the original singer rather than invented. When each syllable starts, how long it lasts, and what note it lands on are all recovered from the original vocal before that vocal is discarded.

That is also why a song with **no** vocal is refused rather than attempted. With nothing to borrow, the tool would have to invent note, onset and duration against the backing track, which is composition rather than signal processing. Those songs are detected by two independent tests, loudness relative to the mix and the fraction of voiced frames, and the run exits rather than producing something botched.

## Pipeline

1. **Separate** the song into vocal and instrumental with Demucs, cached so the expensive step runs once.
2. **Analyse the original vocal before discarding it.** The F0 contour gives the melody; note boundaries come from two signals at once, pitch change and energy onset, because neither alone sees both a slur and a repeated note.
3. **Arrange words onto those slots.** Blips are merged and held notes split, slots are grouped into sung lines, and the payoff word is only allowed where the song actually peaks. The bank holds recorded phrases rather than single words, so a phrase is cut back into its words when a sequence nobody sang is wanted.
4. **Pitch-shift each clip onto its note with formants intact**, so it still sounds like a person rather than a chipmunk.
5. **Mix** over the instrumental, level-matched, out as mp3.

## The two dials

**Mimicry** is how much of the original melody survives, 0 to 1. It is not the same as how many words get shifted: a word too far from its target is moved by whole octaves rather than stretched, so it sings the right note name in the wrong octave, recognisably the tune and still audibly wrong. A syllable like that counts for part of a mimicry point rather than a whole one.

This is why every song has a **ceiling**. One whose melody ranges far above the bank's own register cannot sound fully sung however hard it is pushed, and that ceiling is reported on every run. More clips at *new* pitches raise it; more clips at pitches the bank already has do not. Raising the octave-fold cap from 7 to 12 semitones moved the mean ceiling across 14 songs from 0.78 to 0.90, with the worst case still at 0.60.

**Playfulness** is how freely the words are rearranged, and it is separate from mimicry. Both are rendered every run. Neither is a quality setting; they are two different jokes. Every run draws a new arrangement and writes it out as a file you can read against the song, edit, and feed back to get that take again or a changed one.

## Word banks

A bank is a folder of short sung clips plus an index describing each one, and the vocabulary is entirely the user's: two constants in the config define it and the pipeline knows nothing else about the words. Multi-word clips are worth more than their parts, because a clip holding two words also holds the singer's own transition between them, and a transition cannot be rebuilt by butting two recordings together.

A bank can declare how it wants to be sung by dropping a `bank.json` beside its clips: a placement strategy per level, its own playfulness knobs, a refusal to be cut into syllables, and how loud it sits against the instrumental. A bank that declares nothing behaves exactly as it always did, which is what makes the mechanism safe to add to a bank that already sounds right.

Two strategies exist. `arranged` chooses words to fit the tune. `sequence` replays a bank's clips in the order they were recorded and loops when the song outlasts them, which suits a bank cut from speech, where the order carries the meaning and there is no vocabulary to choose between.

Two clips get special handling. A **shout** is never pitch-shifted, time-stretched or resynthesised, because its character is the attack and the strain, which is exactly what a vocoder smooths away. And one word is allowed **only at the song's peaks**, ranked by pitch and loudness together, so it stays a payoff instead of becoming the texture.

## Engineering decisions worth naming

- **WORLD over Rubber Band for pitch shifting.** Measured across 10 clips, WORLD held the vocal tract within 3% at all shifts while Rubber Band darkened by 15% and smoothed more aggressively. WORLD is about twice as slow, and the formant preservation is exact rather than approximate, so it wins.
- **Separation quality sets the ceiling on everything downstream.** Two backends sit behind one interface, Demucs by default and Mel-Band Roformer optionally, both cached as wavs.
- **No audio ships in the repository, by design.** The clips it was built against are someone else's recordings and the test songs are commercial releases: fine to hold locally, not fine to redistribute. A fresh clone has the tool and none of the material.

## Stack and status

Python 3.11 on Windows with an NVIDIA GPU. PyTorch and torchaudio, Demucs for separation, librosa for analysis utilities, torchcrepe for pitch extraction, pyworld for formant-preserving pitch shift, pyloudnorm for level matching, soundfile for wav I/O, yt-dlp for fetching a song from a page address. Ruff, with each of its ignores justified in the config, and mypy. MIT licensed and public.

SongGenerator's first commit was 2026-08-03, which makes SongGenerator the newest project in the portfolio.

All four build stages are done: separation and mode detection, melody and timing extraction, word mapping, and formant-corrected pitch shifting. 561 tests. A full run of fourteen renders takes about four minutes on an RTX 3080 Ti.

The web interface is designed and not yet built, and its ports are written down before they have two implementations because retrofitting them later would touch every caller. An HTTP edge is being built to that design, shelling out to the same entry points the CLI uses so no frontend has to import pipeline internals. Mode B, the no-vocal case, remains deliberately unimplemented.
