const ARCHITECTURES = new Set(["x86", "x64"]);
const SCENARIOS = new Set([
  "success", "open-failure", "overrun", "hang", "crash", "missing-open", "missing-read", "missing-close", "decorated-open-only", "receive-success", "owned-receive", "owned-connect-failure", "owned-disconnect-failure",
  "owned-connect-hang", "owned-disconnect-crash", "owned-result-then-hang", "request-abi",
  "owned-dtc-read", "owned-dtc-write-failure", "owned-dtc-stop-failure",
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
  if (scenario.startsWith("owned-dtc-")) return [
    ...exportsFor("owned-receive"), ...exportsFor("request-abi"),
  ].sort((a, b) => a.name.localeCompare(b.name, "en"));
  if (scenario === "request-abi") return [
    { name: "PassThruStartMsgFilter", key: "start" },
    { name: "PassThruStopMsgFilter", key: "stop" },
    { name: "PassThruWriteMsgs", key: "write" },
  ];
  if (scenario.startsWith("owned-")) return [
    { name: "PassThruClose", key: "close" }, { name: "PassThruConnect", key: "connect" },
    { name: "PassThruDisconnect", key: "disconnect" }, { name: "PassThruOpen", key: "open" },
    { name: "PassThruReadMsgs", key: "read" }, { name: "PassThruReadVersion", key: "version" },
  ];
  if (scenario === "receive-success") return [{ name: "PassThruReadMsgs", key: "read" }];
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
  const code = scenario === "request-abi" ? requestCode(architecture) : scenarioCode(architecture, scenario);
  if (scenario === "receive-success") code.read = receiveCode(architecture);
  if (scenario.startsWith("owned-")) {
    code.read = receiveCode(architecture, -517782169, scenario.startsWith("owned-dtc-") ? 1000 : 0); // distinct from device
    // Resolved for identity ownership, but never called by the receive worker.
    code.version = Buffer.from(is64 ? [0xb8, 1, 0, 0, 0, 0xc3] : [0xb8, 1, 0, 0, 0, 0xc2, 0x10, 0]);
    Object.assign(code, channelCode(architecture, scenario.startsWith("owned-dtc-") ? 0 : 0x100));
    if (scenario.startsWith("owned-dtc-")) {
      Object.assign(code, requestCode(architecture));
      if (scenario !== "owned-dtc-read") {
        const fail = bytes => Buffer.from([0xb8, 0xf8, 0xff, 0xff, 0xff, ...(is64 ? [0xc3] : [0xc2, bytes, 0])]);
        code.close = code.disconnect = Buffer.from([0x0f, 0x0b]);
        if (scenario === "owned-dtc-write-failure") {
          code.write = fail(16); code.read = code.stop = Buffer.from([0x0f, 0x0b]);
        } else code.stop = fail(8);
      }
    } else if (scenario !== "owned-receive" && scenario !== "owned-result-then-hang") {
      const failure = bytes => Buffer.from([0xb8, 0xf8, 0xff, 0xff, 0xff, ...(is64 ? [0xc3] : [0xc2, bytes, 0])]);
      // An unexpected cleanup or later receive must fail the child process,
      // not silently pass because a stateless fixture tolerated it.
      code.close = Buffer.from([0x0f, 0x0b]);
      if (scenario === "owned-connect-failure" || scenario === "owned-connect-hang") {
        code.connect = scenario === "owned-connect-hang" ? Buffer.from([0xeb, 0xfe]) : failure(20);
        code.read = code.disconnect = Buffer.from([0x0f, 0x0b]);
      } else code.disconnect = scenario === "owned-disconnect-crash" ? Buffer.from([0x0f, 0x0b]) : failure(4);
    }
  }
  const codeOffsets = {};
  let textLength = 0;
  for (const key of Object.keys(code)) {
    textLength = align(textLength, 16); codeOffsets[key] = textLength; textLength += code[key].length;
  }
  // Only the combined nine-export fixture needs a second fixed text block.
  if (textLength > (scenario.startsWith("owned-dtc-") ? 0x400 : 0x200)) throw new Error("native_fixture_text_section_overflow");
  const text = Buffer.alloc(align(textLength, 0x200));
  for (const key of Object.keys(code)) code[key].copy(text, codeOffsets[key]);

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
  const rdataRaw = 0x200 + text.length;
  const relocRaw = rdataRaw + rdata.length;
  const image = Buffer.alloc(relocRaw + reloc.length);
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
  section(1, ".rdata", cursor, 0x2000, rdata.length, rdataRaw, 0x40000040);
  section(2, ".reloc", 12, 0x3000, reloc.length, relocRaw, 0x42000040);
  text.copy(image, 0x200); rdata.copy(image, rdataRaw); reloc.copy(image, relocRaw);
  return image;
}

// Fixed import-free v04.04 ABI oracle, not a driver. No caller-supplied code,
// pointers in the image, entry point, or hardware APIs. Only volatile RAX/EAX
// and flags are touched; x86 pops each exact StdCall argument list.
function requestCode(architecture) {
  const x86 = architecture === "x86";
  const build = (argc, emit) => {
    const bytes = [], branches = [];
    const put = (...values) => bytes.push(...values);
    const arg = index => {
      if (x86) put(0x8b, 0x44, 0x24, index * 4);
      else if (index <= 4) put(...[[0x48, 0x89, 0xc8], [0x48, 0x89, 0xd0], [0x4c, 0x89, 0xc0], [0x4c, 0x89, 0xc8]][index - 1]);
      else put(0x48, 0x8b, 0x44, 0x24, 0x28 + (index - 5) * 8);
    };
    const unequal = () => { put(0x0f, 0x85); branches.push(bytes.length); put(0, 0, 0, 0); };
    const scalar = (index, value) => { arg(index); put(0x3d, ...int32(value)); unequal(); };
    const field = (offset, value) => { put(0x81, 0x78, offset, ...int32(value)); unequal(); };
    emit({ put, arg, scalar, field, unequal });
    const ret = x86 ? [0xc2, argc * 4, 0] : [0xc3];
    put(0x31, 0xc0, ...ret);
    const failure = bytes.length;
    put(0xb8, 0xf8, 0xff, 0xff, 0xff, ...ret);
    const result = Buffer.from(bytes);
    for (const offset of branches) result.writeInt32LE(failure - offset - 4, offset);
    return result;
  };
  return {
    start: build(6, ({ put, arg, scalar, field }) => {
      scalar(1, -517782169); scalar(2, 3);
      for (const [index, address] of [[3, -1], [4, -402194432], [5, -536412160]]) {
        arg(index); field(0, 6); field(16, 4); field(24, address);
      }
      arg(6); put(0xc7, 0x00, 0x67, 0x45, 0x23, 0xd1);
    }),
    stop: build(2, ({ scalar }) => { scalar(1, -517782169); scalar(2, -786217625); }),
    write: build(4, ({ put, arg, scalar, field, unequal }) => {
      scalar(1, -517782169); scalar(4, 0);
      arg(3); field(0, 1);
      arg(2); field(0, 6); field(8, 0x40); field(16, 5); field(24, -536412160);
      put(0x80, 0x78, 28, 3); unequal();
      // Report one queue-accepted message, not a diagnostic response.
      arg(3); put(0xc7, 0x00, 1, 0, 0, 0);
    }),
  };
}

// Fixed, import-free receive ABI oracle. Not a driver and accepts no bytecode.
function receiveCode(architecture, channel = -249346713, timeout = 0) {
  const x86 = architecture === "x86";
  const ret = x86 ? [0xc2, 0x10, 0x00] : [0xc3];
  const failure = Buffer.from([0xb8, 0xf8, 0xff, 0xff, 0xff, ...ret]);
  const write = (offset, value) => Buffer.concat([
    Buffer.from(x86 ? [0xc7, 0x80] : [0xc7, 0x82]), int32(offset), int32(value),
  ]);
  let body = Buffer.concat([
    // x86: EAX = messages, ECX = count. x64: RDX/R8 are already pointers.
    Buffer.from(x86 ? [0x8b, 0x44, 0x24, 0x08, 0x8b, 0x4c, 0x24, 0x0c] : []),
    ...[6, 0, 0, -249346713, 4, 4].map((value, index) => write(index * 4, value)),
    write(24, 0x04030201),
    ...[6, 2, 0, 7, 0, 0].map((value, index) => write(4152 + index * 4, value)),
    Buffer.from(x86 ? [0xc7, 0x01, 2, 0, 0, 0] : [0x41, 0xc7, 0x00, 2, 0, 0, 0]),
    Buffer.from([0x31, 0xc0, ...ret]),
  ]);
  const comparisons = x86 ? [
    [0x81, 0x7c, 0x24, 0x04, ...int32(channel)], // channel
    timeout === 0 ? [0x83, 0x7c, 0x24, 0x10, 0] : [0x81, 0x7c, 0x24, 0x10, ...int32(timeout)],
    [0x8b, 0x44, 0x24, 0x0c, 0x83, 0x38, 3], // requested count
  ] : [
    [0x81, 0xf9, ...int32(channel)],
    timeout === 0 ? [0x41, 0x83, 0xf9, 0] : [0x41, 0x81, 0xf9, ...int32(timeout)],
    [0x41, 0x83, 0x38, 3],
  ];
  for (const compare of comparisons.reverse())
    body = Buffer.concat([Buffer.from([...compare, 0x0f, 0x85]), int32(body.length), body, failure]);
  return body;
}

// Fixed v04.04 channel ABI oracle. No imports, hardware access, or executable input.
function channelCode(architecture, flags = 0x100) {
  const x86 = architecture === "x86";
  const wrap = (body, comparisons, bytes) => {
    const failure = Buffer.from([0xb8, 0xf8, 0xff, 0xff, 0xff, ...(x86 ? [0xc2, bytes, 0] : [0xc3])]);
    for (const compare of [...comparisons].reverse())
      body = Buffer.concat([Buffer.from([...compare, 0x0f, 0x85]), int32(body.length), body, failure]);
    return body;
  };
  const compareStack = (offset, value) => [0x81, 0x7c, 0x24, offset, ...int32(value)];
  const connect = wrap(Buffer.from([
    ...(x86 ? [0x8b, 0x44, 0x24, 0x14] : [0x48, 0x8b, 0x44, 0x24, 0x28]),
    0xc7, 0x00, 0x67, 0x45, 0x23, 0xe1, 0x31, 0xc0,
    ...(x86 ? [0xc2, 0x14, 0] : [0xc3]),
  ]), x86 ? [compareStack(4, -249346713), compareStack(8, 6), compareStack(12, flags), compareStack(16, 500000)]
    : [[0x81, 0xf9, ...int32(-249346713)], [0x81, 0xfa, ...int32(6)],
      [0x41, 0x81, 0xf8, ...int32(flags)], [0x41, 0x81, 0xf9, ...int32(500000)]], 20);
  const disconnect = wrap(Buffer.from([0x31, 0xc0, ...(x86 ? [0xc2, 4, 0] : [0xc3])]),
    [x86 ? compareStack(4, -517782169) : [0x81, 0xf9, ...int32(-517782169)]], 4);
  return { connect, disconnect };
}
