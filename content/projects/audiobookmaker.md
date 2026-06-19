---
title: AudiobookMaker — PDF to audiobook converter
project: audiobookmaker
url: https://github.com/MikkoNumminen/AudiobookMaker/releases
---

# AudiobookMaker

**PDF → audiobook**

AudiobookMaker is a Windows desktop app that converts PDF, EPUB, or plain text files into audiobooks. Scanned PDFs are run through Tesseract OCR first, so even image-based documents are handled. It ships as a Windows installer with auto-updates via GitHub Releases.

Five TTS engines are available under one pipeline — the user picks per book:

- **Edge-TTS** (cloud): 30+ voices in six languages via Microsoft's cloud service
- **Piper** (offline, no GPU needed): local inference, works without an internet connection
- **Chatterbox** with the "Grandmom" voice: voice cloning from a short reference audio clip
- **VoxCPM2**: zero-shot voice cloning and voice design from text (requires an NVIDIA GPU; currently a developer-mode option)
- **Qwen VoiceDesign**: a voice-design POC — like VoxCPM2, a developer-mode option excluded from the shipped installer

English output is strong across all engines. Finnish is harder to synthesize with available TTS resources, so Finnish text gets a dedicated 16-pass normalization pipeline that handles governor-word number inflection, abbreviation expansion, unit agreement, and loanword respelling — advancing with every release.

The Chatterbox engine is the same one that generates all in-game voice narration for Spacepotatis. I also sent two upstream PRs to resemble-ai/chatterbox (#505, #510) after diagnosing a memory leak in its inference path.

## Highlights

- Chatterbox voice cloning with the "Grandmom" voice
- 16-pass Finnish text normalization pipeline, 3000+ tests
- Voices the in-game story of Spacepotatis

## Tech stack

Python, PyMuPDF, ebooklib, ocrmypdf, Tesseract, num2words, edge-tts, Piper, Chatterbox, VoxCPM2, PyTorch, CustomTkinter, pydub, pygame, ffmpeg, PyInstaller, Inno Setup, GitHub Actions

## External integrations

Microsoft Edge-TTS (cloud voice service)

## Status

Work in progress — [Releases](https://github.com/MikkoNumminen/AudiobookMaker/releases) · [GitHub](https://github.com/MikkoNumminen/AudiobookMaker)

## Connections

AudiobookMaker generates all in-game voice narration for Spacepotatis.
