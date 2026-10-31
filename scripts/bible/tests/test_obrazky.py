import io

from PIL import Image, ImageDraw

import obrazky


def _jpeg_s_exif(orientace: int) -> bytes:
    obr = Image.new('L', (1600, 1200), 255)   # na šířku, ale EXIF říká „otoč"
    ImageDraw.Draw(obr).rectangle((0, 0, 100, 1200), fill=0)
    exif = Image.Exif()
    exif[0x0112] = orientace
    proud = io.BytesIO()
    obr.save(proud, format='JPEG', exif=exif)
    return proud.getvalue()


def _otevri(jpeg: bytes) -> Image.Image:
    return Image.open(io.BytesIO(jpeg))


def test_fotka_z_telefonu_se_otoci_podle_exif():
    vystup = _otevri(obrazky.obrazek_na_jpeg(_jpeg_s_exif(6)))
    assert vystup.size[1] > vystup.size[0]   # na výšku, jak ji člověk vyfotil
    assert vystup.mode == 'L' and max(vystup.size) == obrazky.MAX_HRANA


def test_16bitovy_sken_neni_bily():
    obr = Image.new('I;16', (400, 600), 50000)
    ImageDraw.Draw(obr).rectangle((50, 50, 350, 120), fill=2000)   # tmavý text na světlém papíře
    proud = io.BytesIO()
    obr.save(proud, format='PNG')
    vystup = _otevri(obrazky.obrazek_na_jpeg(proud.getvalue())).convert('L')
    nejtmavsi, nejsvetlejsi = vystup.getextrema()
    assert nejtmavsi < 60 and nejsvetlejsi > 200
    assert not obrazky.je_prazdna_strana(obrazky.obrazek_na_jpeg(proud.getvalue()))


def test_pruhledne_png_ma_bily_papir():
    obr = Image.new('RGBA', (400, 600), (0, 0, 0, 0))   # průhledné pozadí
    ImageDraw.Draw(obr).rectangle((50, 50, 350, 80), fill=(0, 0, 0, 255))
    proud = io.BytesIO()
    obr.save(proud, format='PNG')
    vystup = _otevri(obrazky.obrazek_na_jpeg(proud.getvalue()))
    histogram = vystup.histogram()
    assert sum(histogram[200:]) > 0.8 * sum(histogram)   # většina bílá, ne černá


def test_vicestrankovy_tiff():
    snimky = [Image.new('L', (300, 400), 255) for _ in range(3)]
    proud = io.BytesIO()
    snimky[0].save(proud, format='TIFF', save_all=True, append_images=snimky[1:])
    data = proud.getvalue()
    assert obrazky.pocet_snimku(data) == 3
    assert all(_otevri(obrazky.obrazek_na_jpeg(data, i)).format == 'JPEG' for i in range(3))


def test_prazdna_strana():
    proud = io.BytesIO()
    Image.new('L', (800, 1100), 250).save(proud, format='JPEG')
    assert obrazky.je_prazdna_strana(proud.getvalue())
