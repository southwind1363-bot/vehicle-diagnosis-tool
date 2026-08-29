const ARCHITECTURES = new Set(["x86", "x64"]);
const SCENARIOS = new Set([
  "success", "open-failure", "overrun", "hang", "crash", "missing-open", "missing-read", "missing-close", "decorated-open-only",
]);

function align(value, boundary) { return Math.ceil(value / boundary) * boundary; }
function ascii(value) { return Buffer.from(`${value}\0`, "ascii"); }

function guardedOpen(architecture, body) {
  const failure = Buffer.from(architecture === "x86"
    ? [0xb8, 0xf8, 0xff, 0xff, 0xff, 0xc2, 0x08, 0x00]
    : [0xb8, 0xf8, 0xff, 0xff, 0xff, 0xc3]);
  if (architecture === "x86")
    return Buffer.concat([Buffer.from([0x83, 0x7c, 0x24, 0x04, 0x00, 0x0f, 0x85]), int32(body.length), body, failure]);
  return Buffer.concat([Buffer.from([0x48, 0x85, 0xc9, 0x0f, 0x85]), int32(body.length), body, failure]);
}

function guardedDevice(architecture, body, x86ReturnBytes) {
  const failure = Buffer.from(architecture === "x86"
    ? [0xb8, 0xf8, 0xff, 0xff, 0xff, 0xc2, x86ReturnBytes, 0x00]
    : [0xb8, 0xf8, 0xff, 0xff, 0xff, 0xc3]);
  const compare = architecture === "x86"
    ? Buffer.from([0x81, 0x7c, 0x24, 0x04, 0x67, 0x45, 0x23, 0xf1, 0x0f, 0x85])
    : Buffer.from([0x81, 0xf9, 0x67, 0x45, 0x23, 0xf1, 0x0f, 0x85]);
  return Buffer.concat([compare, int32(body.length), body, failure]);
}

function int32(value) { const result = Buffer.alloc(4); result.writeInt32LE(value); return result; }

function successCode(architecture) {
  if (architecture === "x86") {
    const write = (stackOffset, value, marker) => {
      const code = [0x8b, 0x44, 0x24, stackOffset];
      [...Buffer.from(`${value}\0`, "ascii")].forEach((byte, offset) => code.push(0xc6, 0x40, offset, byte));
      code.push(0xc6, 0x40, 79, marker);
      return code;
    };
    return {
      close: Buffer.from([0x31, 0xc0, 0xc2, 0x04, 0x00]),
      open: Buffer.from([0x8b, 0x44, 0x24, 0x08, 0xc7, 0x00, 0x67, 0x45, 0x23, 0xf1, 0x31, 0xc0, 0xc2, 0x08, 0x00]),
      read: Buffer.from([
        ...write(0x08, "fixture-fw", 0xf1), ...write(0x0c, "fixture-dll", 0xd1), ...write(0x10, "04.04", 0xa1),
        0x31, 0xc0, 0xc2, 0x10, 0x00,
      ]),
    };
  }
  const write = (prefix, value, marker) => {
    const code = [];
    [...Buffer.from(`${value}\0`, "ascii")].forEach((byte, offset) => code.push(...prefix, offset, byte));
    code.push(...prefix, 79, marker);
    return code;
  };
  return {
    close: Buffer.from([0x31, 0xc0, 0xc3]),
    open: Buffer.from([0xc7, 0x02, 0x67, 0x45, 0x23, 0xf1, 0x31, 0xc0, 0xc3]),
    read: Buffer.from([
      ...write([0xc6, 0x42], "fixture-fw", 0xf1),
      ...write([0x41, 0xc6, 0x40], "fixture-dll", 0xd1),
      ...write([0x41, 0xc6, 0x41], "04.04", 0xa1), 0x31, 0xc0, 0xc3,
    ]),
  };
}

function scenarioCode(architecture, scenario) {
  const code = successCode(architecture);
  if (scenario === "open-failure") {
    code.open = Buffer.from(architecture === "x86"
      ? [0xb8, 0xf9, 0xff, 0xff, 0xff, 0xc2, 0x08, 0x00]
      : [0xb8, 0xf9, 0xff, 0xff, 0xff, 0xc3]);
  }
  if (scenario === "overrun") {
    code.read = Buffer.from(architecture === "x86"
      ? [0x8b, 0x44, 0x24, 0x08, 0xc6, 0x40, 0x50, 0x00, 0x31, 0xc0, 0xc2, 0x10, 0x00]
      : [0xc6, 0x42, 0x50, 0x00, 0x31, 0xc0, 0xc3]);
  }
  if (scenario === "hang") code.read = Buffer.from([0xeb, 0xfe]);
  if (scenario === "crash") code.read = Buffer.from([0x0f, 0x0b]);
  code.open = guardedOpen(architecture, code.open);
  code.read = guardedDevice(architecture, code.read, 0x10);
  code.close = guardedDevice(architecture, code.close, 0x04);
  return code;
}

function exportsFor(scenario) {
  if (scenario === "decorated-open-only") return [{ name: "_PassThruOpen@8", key: "open" }];
  return [
    { name: "PassThruClose", key: "close" },
    { name: "PassThruOpen", key: "open" },
    { name: "PassThruReadVersion", key: "read" },
  ].filter(item => !(scenario === "missing-open" && item.key === "open")
    && !(scenario === "missing-read" && item.key === "read")
    && !(scenario === "missing-close" && item.key === "close"));
}

export function buildJ2534NativeFixture(architecture, scenario) {
  if (!ARCHITECTURES.has(architecture) || !SCENARIOS.has(scenario)) throw new Error("native_fixture_option_rejected");
  if (scenario === "decorated-open-only" && architecture !== "x86") throw new Error("native_fixture_option_rejected");

  const is64 = architecture === "x64";
  const code = scenarioCode(architecture, scenario);
  const codeOffsets = {};
  let textLength = 0;
  for (const key of ["close", "open", "read"]) {
    textLength = align(textLength, 16); codeOffsets[key] = textLength; textLength += code[key].length;
  }
  const text = Buffer.alloc(align(textLength, 0x200));
  for (const key of ["close", "open", "read"]) code[key].copy(text, codeOffsets[key]);

  const exports = exportsFor(scenario);
  const directorySize = 40;
  const functionsOffset = directorySize;
  const namesOffset = functionsOffset + exports.length * 4;
  const ordinalsOffset = namesOffset + exports.length * 4;
  let cursor = align(ordinalsOffset + exports.length * 2, 4);
  const dllNameOffset = cursor; cursor += ascii("j2534-native-fixture.dll").length;
  const nameOffsets = exports.map(item => { const offset = cursor; cursor += ascii(item.name).length; return offset; });
  const rdata = Buffer.alloc(align(cursor, 0x200));
  const rva = 0x2000;
  rdata.writeUInt32LE(rva + dllNameOffset, 12);
  rdata.writeUInt32LE(1, 16);
  rdata.writeUInt32LE(exports.length, 20); rdata.writeUInt32LE(exports.length, 24);
  rdata.writeUInt32LE(rva + functionsOffset, 28); rdata.writeUInt32LE(rva + namesOffset, 32); rdata.writeUInt32LE(rva + ordinalsOffset, 36);
  exports.forEach((item, index) => {
    rdata.writeUInt32LE(0x1000 + codeOffsets[item.key], functionsOffset + index * 4);
    rdata.writeUInt32LE(rva + nameOffsets[index], namesOffset + index * 4);
    rdata.writeUInt16LE(index, ordinalsOffset + index * 2);
    ascii(item.name).copy(rdata, nameOffsets[index]);
  });
  ascii("j2534-native-fixture.dll").copy(rdata, dllNameOffset);

  const reloc = Buffer.alloc(0x200);
  reloc.writeUInt32LE(0x1000, 0); reloc.writeUInt32LE(12, 4);
  const optionalSize = is64 ? 0xf0 : 0xe0;
  const sectionTable = 0x98 + optionalSize;
  const image = Buffer.alloc(0x600 + reloc.length);
  image.writeUInt16LE(0x5a4d, 0); image.writeUInt32LE(0x80, 0x3c); image.write("PE\0\0", 0x80, "binary");
  image.writeUInt16LE(is64 ? 0x8664 : 0x14c, 0x84); image.writeUInt16LE(3, 0x86);
  image.writeUInt16LE(optionalSize, 0x94); image.writeUInt16LE(is64 ? 0x2022 : 0x2102, 0x96);
  const optional = 0x98;
  image.writeUInt16LE(is64 ? 0x20b : 0x10b, optional); image.writeUInt32LE(text.length, optional + 4);
  image.writeUInt32LE(rdata.length + reloc.length, optional + 8); image.writeUInt32LE(0, optional + 16);
  image.writeUInt32LE(0x1000, optional + 20);
  if (is64) image.writeBigUInt64LE(0x180000000n, optional + 24);
  else { image.writeUInt32LE(0x2000, optional + 24); image.writeUInt32LE(0x10000000, optional + 28); }
  image.writeUInt32LE(0x1000, optional + 32); image.writeUInt32LE(0x200, optional + 36);
  image.writeUInt16LE(6, optional + 40); image.writeUInt16LE(6, optional + 48);
  image.writeUInt32LE(0x4000, optional + 56); image.writeUInt32LE(0x200, optional + 60);
  image.writeUInt16LE(3, optional + 68); image.writeUInt16LE(0x140, optional + 70);
  if (is64) {
    image.writeBigUInt64LE(0x100000n, optional + 72); image.writeBigUInt64LE(0x1000n, optional + 80);
    image.writeBigUInt64LE(0x100000n, optional + 88); image.writeBigUInt64LE(0x1000n, optional + 96);
    image.writeUInt32LE(16, optional + 108);
  } else {
    image.writeUInt32LE(0x100000, optional + 72); image.writeUInt32LE(0x1000, optional + 76);
    image.writeUInt32LE(0x100000, optional + 80); image.writeUInt32LE(0x1000, optional + 84);
    image.writeUInt32LE(16, optional + 92);
  }
  const directories = optional + (is64 ? 112 : 96);
  image.writeUInt32LE(0x2000, directories); image.writeUInt32LE(cursor, directories + 4);
  image.writeUInt32LE(0x3000, directories + 40); image.writeUInt32LE(12, directories + 44);
  const section = (index, name, virtualSize, virtualAddress, rawSize, rawOffset, characteristics) => {
    const offset = sectionTable + index * 40;
    image.write(name, offset, "ascii"); image.writeUInt32LE(virtualSize, offset + 8); image.writeUInt32LE(virtualAddress, offset + 12);
    image.writeUInt32LE(rawSize, offset + 16); image.writeUInt32LE(rawOffset, offset + 20); image.writeUInt32LE(characteristics, offset + 36);
  };
  section(0, ".text", textLength, 0x1000, text.length, 0x200, 0x60000020);
  section(1, ".rdata", cursor, 0x2000, rdata.length, 0x400, 0x40000040);
  section(2, ".reloc", 12, 0x3000, reloc.length, 0x600, 0x42000040);
  text.copy(image, 0x200); rdata.copy(image, 0x400); reloc.copy(image, 0x600);
  return image;
}
