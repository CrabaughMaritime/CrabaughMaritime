const formats = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', doc: 'application/msword', csv: 'text/csv', txt: 'text/plain'
};
export const accept = Object.keys(formats).map(ext => '.' + ext).join(',');

async function isOfficePackage(file, expected) {
  // Inspect the ZIP central directory without extracting untrusted entries.
  const tailStart = Math.max(0, file.size - 65557);
  const tail = new DataView(await file.slice(tailStart).arrayBuffer());
  let end = tail.byteLength - 22;
  while (end >= 0) {
       if (tail.getUint32(end, true) === 0x06054b50 && end + 22 + tail.getUint16(end + 20, true) === tail.byteLength) break;
    end--;
  }
  if (end < 0 || tail.getUint32(end + 4, true) !== 0) return false;
  const count = tail.getUint16(end + 10, true);
  const length = tail.getUint32(end + 12, true);
  const offset = tail.getUint32(end + 16, true);
  if (count > 10000 || offset + length > tailStart + end) return false;
  const buffer = await file.slice(offset, offset + length).arrayBuffer();
  const directory = new DataView(buffer);
  const names = new Set();
  let position = 0;
  for (let i = 0; i < count; i++) {
    if (position + 46 > length || directory.getUint32(position, true) !== 0x02014b50) return false;
    const flags = directory.getUint16(position + 8, true);
        const size = directory.getUint16(position + 28, true);
    if ((flags & 1) || position + 46 + size > length) return false;
    const name = new TextDecoder().decode(new Uint8Array(buffer, position + 46, size));
    if (/vbaProject\.bin$/i.test(name)) return false;
    names.add(name);
    position += 46 + size + directory.getUint16(position + 30, true) + directory.getUint16(position + 32, true);
  }
  return position === length && names.has('[Content_Types].xml') && names.has(expected);
}

export async function validateReceipt(file) {
  if (!file?.size || file.size > 10485760) throw Error('Choose a non-empty file up to 10 MB.');
  const ext = file.name.split('.').pop().toLowerCase();
  if (!Object.hasOwn(formats, ext)) throw Error('This file format is unsupported.');
    const bytes = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  const ascii = new TextDecoder().decode(bytes);
  const starts = (...signature) => signature.every((byte, i) => bytes[i] === byte);
  const valid = {
    jpg: starts(255, 216, 255), jpeg: starts(255, 216, 255), png: starts(137, 80, 78, 71, 13, 10, 26, 10),
    gif: /^GIF8[79]a/.test(ascii), webp: /^RIFF[\s\S]{4}WEBP/.test(ascii),
    heic: /^(?:heic|heix|hevc|hevx|mif1|msf1|heif)/.test(ascii.slice(8)) && ascii.slice(4, 8) === 'ftyp',
    heif: /^(?:heic|heix|hevc|hevx|mif1|msf1|heif)/.test(ascii.slice(8)) && ascii.slice(4, 8) === 'ftyp',
    pdf: ascii.startsWith('%PDF-'), docx: starts(80, 75, 3, 4), xlsx: starts(80, 75, 3, 4),
        doc: starts(208, 207, 17, 224, 161, 177, 26, 225), xls: starts(208, 207, 17, 224, 161, 177, 26, 225),
    csv: !bytes.includes(0), txt: !bytes.includes(0)
  };
  const officeEntry = { docx: 'word/document.xml', xlsx: 'xl/workbook.xml' }[ext];
  if (officeEntry && valid[ext]) valid[ext] = await isOfficePackage(file, officeEntry);
  if (!valid[ext]) throw Error('The file contents do not match the extension.');
  return formats[ext];
}
