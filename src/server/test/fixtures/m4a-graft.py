import argparse
import struct


def atom(kind, body):
    return struct.pack('>I4s', len(body) + 8, kind) + body


def parse(data, start=0, end=None):
    end = len(data) if end is None else end
    pos = start
    while pos + 8 <= end:
        size, kind = struct.unpack('>I4s', data[pos:pos + 8])
        yield kind, pos, pos + size
        pos += size


def children(box, skip=8):
    return [(k, box[s:e]) for k, s, e in parse(box, skip)]


def data_atom(flags, payload):
    return atom(b'data', struct.pack('>II', flags, 0) + payload)


def text_item(kind, text):
    return atom(kind, data_atom(1, text.encode()))


def freeform(name, text):
    return atom(
        b'----',
        atom(b'mean', b'\0\0\0\0com.apple.iTunes')
        + atom(b'name', b'\0\0\0\0' + name.encode())
        + data_atom(1, text.encode()),
    )


def scrub(items, gnre):
    out = []
    for kind, box in items:
        if kind == b'covr':
            continue
        if kind == b'apID':
            box = text_item(kind, 'scrubbed@example.com')
        elif kind == b'purd':
            box = text_item(kind, '2000-01-01 00:00:00')
        elif kind == b'\xa9gen' and gnre:
            box = atom(b'gnre', data_atom(0, struct.pack('>H', 18)))
            kind = b'gnre'
        out.append((kind, box))
    out.append((b'ownr', text_item(b'ownr', 'Scrubbed Owner')))
    plist = '<?xml version="1.0"?><plist version="1.0"><dict><key>studio</key><string>Scrubbed</string></dict></plist>'
    out.append((b'----', freeform('iTunMOVI', plist)))
    return out


def source_items(path):
    data = open(path, 'rb').read()
    moov = next(data[s:e] for k, s, e in parse(data) if k == b'moov')
    udta = next(b for k, b in children(moov) if k == b'udta')
    meta = next(b for k, b in children(udta) if k == b'meta')
    ilst = next(b for k, b in children(meta, 12) if k == b'ilst')
    return children(ilst)


def replace_ilst(moov, ilst, meta_padding):
    meta_body = struct.pack('>I', 0) + atom(
        b'hdlr', b'\0' * 8 + b'mdir' + b'appl' + b'\0' * 9
    ) + ilst
    if meta_padding:
        meta_body += atom(b'free', b'\0' * (meta_padding - 8))
    udta = atom(b'udta', atom(b'meta', meta_body))
    parts = [(k, b) for k, b in children(moov) if k != b'udta']
    return atom(b'moov', b''.join(b for _, b in parts) + udta)


def to_co64(box):
    kind, body = box[4:8], box[8:]
    if kind == b'stco':
        count = struct.unpack('>I', body[4:8])[0]
        offsets = struct.unpack(f'>{count}I', body[8:8 + 4 * count])
        return atom(b'co64', body[:8] + struct.pack(f'>{count}Q', *offsets))
    if kind in (b'moov', b'trak', b'mdia', b'minf', b'stbl'):
        return atom(kind, b''.join(to_co64(b) for _, b in children(box)))
    return box


def shift_offsets(box, shift):
    kind, body = box[4:8], box[8:]
    if kind == b'stco':
        count = struct.unpack('>I', body[4:8])[0]
        offsets = struct.unpack(f'>{count}I', body[8:8 + 4 * count])
        return atom(kind, body[:8] + struct.pack(f'>{count}I', *[o + shift for o in offsets]))
    if kind == b'co64':
        count = struct.unpack('>I', body[4:8])[0]
        offsets = struct.unpack(f'>{count}Q', body[8:8 + 8 * count])
        return atom(kind, body[:8] + struct.pack(f'>{count}Q', *[o + shift for o in offsets]))
    if kind in (b'moov', b'trak', b'mdia', b'minf', b'stbl'):
        return atom(kind, b''.join(shift_offsets(b, shift) for _, b in children(box)))
    return box


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('source')
    parser.add_argument('base')
    parser.add_argument('out')
    parser.add_argument('--moov-first', action='store_true')
    parser.add_argument('--meta-padding', type=int, default=0)
    parser.add_argument('--free-padding', type=int, default=0)
    parser.add_argument('--co64', action='store_true')
    parser.add_argument('--gnre', action='store_true')
    args = parser.parse_args()

    ilst = atom(b'ilst', b''.join(b for _, b in scrub(source_items(args.source), args.gnre)))
    data = open(args.base, 'rb').read()
    top = {k: (s, e) for k, s, e in parse(data)}
    ftyp = data[slice(*top[b'ftyp'])]
    mdat = data[slice(*top[b'mdat'])]
    moov = data[slice(*top[b'moov'])]
    moov = replace_ilst(moov, ilst, args.meta_padding)
    if args.co64:
        moov = to_co64(moov)
    if args.moov_first:
        pad = atom(b'free', b'\0' * (args.free_padding - 8)) if args.free_padding else b''
        mdat_start = len(ftyp) + len(moov) + len(pad)
        old_mdat_start = top[b'mdat'][0]
        moov = shift_offsets(moov, mdat_start - old_mdat_start)
        out = ftyp + moov + pad + mdat
    else:
        out = data[:top[b'moov'][0]] + moov + data[top[b'moov'][1]:]
        assert len(ftyp) + 8 <= top[b'mdat'][0]
    open(args.out, 'wb').write(out)


main()
