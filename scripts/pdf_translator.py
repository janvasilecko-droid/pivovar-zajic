#!/usr/bin/env python3
"""
PDF Translator: English → Czech
================================
Reads a PDF using PyMuPDF, extracts text page-by-page, translates it
to Czech via Google Translate (deep-translator), and writes:
  - a translated .txt file (UTF-8)
  - a translated .pdf file with basic page layout (ReportLab)

Designed for technical books like "Technology, Brewing and Malting"
by Wolfgang Kunze, but works with any English PDF.

Usage:
    python pdf_translator.py <input.pdf> <output_folder> [--start N] [--end N]

Requirements:
    pip install -r requirements.txt
"""

from __future__ import annotations

import argparse
import logging
import os
import re
import sys
import time
from pathlib import Path
from typing import List, Optional, Tuple

# ---------------------------------------------------------------------------
# Dependency checks – fail early with a clear message
# ---------------------------------------------------------------------------

try:
    import fitz  # PyMuPDF
except ImportError:
    sys.exit(
        "ERROR: PyMuPDF not installed.\n"
        "  Run: pip install PyMuPDF>=1.23.0"
    )

try:
    from deep_translator import GoogleTranslator
except ImportError:
    sys.exit(
        "ERROR: deep-translator not installed.\n"
        "  Run: pip install deep-translator>=1.11.0"
    )

try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
except ImportError:
    sys.exit(
        "ERROR: reportlab not installed.\n"
        "  Run: pip install reportlab>=4.0"
    )

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Delay (seconds) between translation API calls to stay under rate limits.
API_DELAY_S: float = 0.5

# Google Translate has a per-request character limit; we chunk large pages.
MAX_CHARS_PER_REQUEST: int = 4500

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("pdf_translator")

# ---------------------------------------------------------------------------
# Translation helpers
# ---------------------------------------------------------------------------

_translator: Optional[GoogleTranslator] = None


def _get_translator() -> GoogleTranslator:
    """Lazy-init the translator (single shared instance)."""
    global _translator
    if _translator is None:
        _translator = GoogleTranslator(source="en", target="cs")
    return _translator


def translate_text(text: str) -> str:
    """
    Translate English text to Czech.

    If the text exceeds the per-request limit it is split into chunks,
    each chunk translated independently, then reassembled.
    Empty or whitespace-only input is returned unchanged.
    """
    stripped = text.strip()
    if not stripped:
        return text  # preserve original whitespace

    translator = _get_translator()

    if len(stripped) <= MAX_CHARS_PER_REQUEST:
        return _translate_chunk(translator, stripped)

    # Split into chunks by paragraph boundaries when possible
    chunks = _split_into_chunks(stripped, MAX_CHARS_PER_REQUEST)
    translated_parts: List[str] = []
    for i, chunk in enumerate(chunks):
        translated_parts.append(_translate_chunk(translator, chunk))
        if i < len(chunks) - 1:
            time.sleep(API_DELAY_S)

    return "\n".join(translated_parts)


def _translate_chunk(translator: GoogleTranslator, text: str) -> str:
    """Translate a single chunk with retry logic."""
    max_retries = 3
    for attempt in range(1, max_retries + 1):
        try:
            result = translator.translate(text)
            return result if result else text
        except Exception as exc:
            log.warning(
                "  Translation attempt %d/%d failed: %s",
                attempt, max_retries, exc,
            )
            if attempt < max_retries:
                wait = 2 ** attempt  # exponential back-off: 2s, 4s
                log.info("  Retrying in %ds …", wait)
                time.sleep(wait)
    # All retries exhausted — return original text so output is still usable
    log.error("  All translation attempts failed; returning original text.")
    return text


def _split_into_chunks(text: str, max_len: int) -> List[str]:
    """
    Split *text* into pieces ≤ max_len characters, trying to break on
    paragraph boundaries (double newline) first, then single newlines,
    then hard character limit.
    """
    if len(text) <= max_len:
        return [text]

    paragraphs = re.split(r"\n\s*\n", text)
    chunks: List[str] = []
    current = ""

    for para in paragraphs:
        if len(current) + len(para) + 2 <= max_len:
            current = f"{current}\n\n{para}" if current else para
        else:
            if current:
                chunks.append(current)
            # If a single paragraph exceeds the limit, hard-split it
            if len(para) > max_len:
                for i in range(0, len(para), max_len):
                    chunks.append(para[i : i + max_len])
                current = ""
            else:
                current = para

    if current:
        chunks.append(current)

    return chunks


# ---------------------------------------------------------------------------
# PDF text extraction
# ---------------------------------------------------------------------------

def extract_text_from_pdf(
    pdf_path: str,
    start: int = 0,
    end: Optional[int] = None,
) -> List[Tuple[int, str]]:
    """
    Open a PDF and extract text from each page.

    Returns a list of (page_index_1based, page_text) tuples.
    Pages with no extractable text are included with an empty string.
    """
    doc = fitz.open(pdf_path)
    total = doc.page_count
    if end is None or end > total:
        end = total

    log.info(
        "Opened '%s' — %d pages total, translating pages %d–%d",
        pdf_path, total, start + 1, end,
    )

    pages: List[Tuple[int, str]] = []
    for idx in range(start, end):
        page = doc[idx]
        text = page.get_text("text")  # plain-text extraction
        pages.append((idx + 1, text))  # 1-based page number

    doc.close()
    return pages


# ---------------------------------------------------------------------------
# Output: plain-text file
# ---------------------------------------------------------------------------

def save_text_output(
    pages: List[Tuple[int, str]],
    output_path: str,
) -> None:
    """Write translated pages to a UTF-8 text file with page separators."""
    with open(output_path, "w", encoding="utf-8") as fh:
        for page_num, text in pages:
            fh.write(f"{'=' * 60}\n")
            fh.write(f"  STRÁNA {page_num}\n")
            fh.write(f"{'=' * 60}\n\n")
            fh.write(text)
            fh.write("\n\n")
    log.info("Text output saved to '%s'", output_path)


# ---------------------------------------------------------------------------
# Output: PDF file (ReportLab)
# ---------------------------------------------------------------------------

def _register_czech_font() -> str:
    """
    Try to register a system font that supports Czech diacritics.
    Falls back to Helvetica (limited diacritics) if no TTF is found.
    Returns the registered font name.
    """
    # Common TTF paths on Windows / Linux / macOS that support Czech
    candidate_paths = [
        # Windows
        r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\calibri.ttf",
        r"C:\Windows\Fonts\times.ttf",
        # Linux
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/TTF/DejaVuSans.ttf",
        # macOS
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial.ttf",
    ]
    for path in candidate_paths:
        if os.path.isfile(path):
            try:
                pdfmetrics.registerFont(TTFont("CzechFont", path))
                log.info("Registered TTF font: %s", path)
                return "CzechFont"
            except Exception:
                continue  # try next candidate

    log.warning(
        "No Czech-compatible TTF found; falling back to Helvetica. "
        "Czech diacritics may not render correctly in the output PDF."
    )
    return "Helvetica"


def save_pdf_output(
    pages: List[Tuple[int, str]],
    output_path: str,
) -> None:
    """
    Create a new PDF containing the translated text.

    Uses ReportLab's SimpleDocTemplate with paragraph flow — not a
    pixel-perfect replica of the original, but preserves page ordering
    and basic readability.
    """
    font_name = _register_czech_font()

    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
    )

    styles = getSampleStyleSheet()

    # Custom style with Czech font
    body_style = ParagraphStyle(
        "CzechBody",
        parent=styles["Normal"],
        fontName=font_name,
        fontSize=10,
        leading=14,
        spaceAfter=6,
        encoding="utf-8",
    )
    page_header_style = ParagraphStyle(
        "PageHeader",
        parent=styles["Normal"],
        fontName=font_name,
        fontSize=12,
        leading=16,
        spaceBefore=4,
        spaceAfter=12,
        alignment=1,  # center
        encoding="utf-8",
    )

    story = []
    for page_num, text in pages:
        if page_num > 1:
            story.append(PageBreak())

        story.append(
            Paragraph(f"— Strana {page_num} —", page_header_style)
        )

        if not text.strip():
            story.append(Paragraph("[prázdná strana]", body_style))
            continue

        # Split into paragraphs for better formatting
        paragraphs = re.split(r"\n\s*\n", text)
        for para_text in paragraphs:
            clean = para_text.strip()
            if not clean:
                continue
            # Escape XML special chars for ReportLab Paragraph
            safe = (
                clean.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
            )
            # Re-apply line breaks within the paragraph
            safe = safe.replace("\n", "<br/>")
            story.append(Paragraph(safe, body_style))
            story.append(Spacer(1, 4))

    doc.build(story)
    log.info("PDF output saved to '%s'", output_path)


# ---------------------------------------------------------------------------
# Main translation pipeline
# ---------------------------------------------------------------------------

def translate_pdf(
    input_pdf: str,
    output_folder: str,
    start: int = 0,
    end: Optional[int] = None,
) -> None:
    """
    Full pipeline: extract → translate → save.

    Steps:
      1. Validate inputs.
      2. Extract text from each requested page.
      3. Translate each page with progress reporting.
      4. Save translated text and PDF.
    """
    input_path = Path(input_pdf)
    if not input_path.is_file():
        sys.exit(f"ERROR: Input PDF not found: {input_pdf}")

    out_dir = Path(output_folder)
    out_dir.mkdir(parents=True, exist_ok=True)

    stem = input_path.stem
    txt_out = out_dir / f"{stem}_cs.txt"
    pdf_out = out_dir / f"{stem}_cs.pdf"

    # --- Step 1: Extract text ---
    log.info("Step 1/3 — Extracting text from PDF …")
    pages = extract_text_from_pdf(input_pdf, start, end)
    total = len(pages)

    # --- Step 2: Translate ---
    log.info("Step 2/3 — Translating %d pages en→cs …", total)
    translated_pages: List[Tuple[int, str]] = []
    failed_pages: List[int] = []

    for i, (page_num, text) in enumerate(pages, 1):
        print(f"\r  Translating page {page_num}/{start + total} …", end="", flush=True)
        try:
            translated = translate_text(text)
            translated_pages.append((page_num, translated))
        except Exception as exc:
            log.error("  Page %d FAILED: %s", page_num, exc)
            failed_pages.append(page_num)
            # Keep the original text so output is still complete
            translated_pages.append((page_num, f"[PŘEKLAD SELHAL — ORIGINAL]\n{text}"))

        # Rate-limit pause (skip after last page)
        if i < total:
            time.sleep(API_DELAY_S)

    print()  # newline after progress line

    if failed_pages:
        log.warning(
            "Translation failed on %d page(s): %s",
            len(failed_pages), failed_pages,
        )

    # --- Step 3: Save outputs ---
    log.info("Step 3/3 — Saving translated outputs …")
    save_text_output(translated_pages, str(txt_out))
    save_pdf_output(translated_pages, str(pdf_out))

    log.info("Done! Files written:")
    log.info("  TXT : %s", txt_out)
    log.info("  PDF : %s", pdf_out)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Translate an English PDF to Czech (text + PDF output).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python pdf_translator.py book.pdf ./translated\n"
            "  python pdf_translator.py book.pdf ./output --start 10 --end 20\n"
        ),
    )
    parser.add_argument(
        "input_pdf",
        help="Path to the source English PDF file.",
    )
    parser.add_argument(
        "output_folder",
        help="Directory where translated files will be saved.",
    )
    parser.add_argument(
        "--start",
        type=int,
        default=0,
        help="Start page (0-based index, default: 0 = first page).",
    )
    parser.add_argument(
        "--end",
        type=int,
        default=None,
        help="End page (exclusive, default: last page).",
    )
    return parser.parse_args(argv)


def main() -> None:
    args = parse_args()
    log.info("=" * 60)
    log.info("PDF Translator — English → Czech")
    log.info("=" * 60)
    translate_pdf(
        input_pdf=args.input_pdf,
        output_folder=args.output_folder,
        start=args.start,
        end=args.end,
    )


if __name__ == "__main__":
    main()
