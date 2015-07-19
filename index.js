var iconv = require('iconv-lite');

var ASE_SIGNATURE = 0x41534546;
var ASE_VERSION_MAYOR = 1;
var ASE_VERSION_MINOR = 0;
var ASE_BLOCK_TYPE_COLOR = 0x1;
var ASE_BLOCK_TYPE_GROUP_START = 0xC001;
var ASE_BLOCK_TYPE_GROUP_END = 0xC002;
var ASE_COLOR_TYPES = ['global', 'spot', 'normal'];

module.exports = function (buffer) {
  assert(Buffer.isBuffer(buffer), 'The argument is not an instance of Buffer', TypeError);
  assert(buffer.readUInt32BE(0) === ASE_SIGNATURE, 'Invalid file signature: ASEF header expected');
  assert(buffer.readUInt16BE(4) === ASE_VERSION_MAYOR, 'Only version 1.0 of the ASE format is supported');
  assert(buffer.readUInt16BE(6) === ASE_VERSION_MINOR, 'Only version 1.0 of the ASE format is supported');

  return readBlocks(buffer, 12).reduce(createGroups, []);
};

function assert(condition, message, ErrorType) {
  ErrorType = ErrorType || Error;
  if (!condition) {
    throw new ErrorType(message);
  }
}

function readBlocks(buffer, offset) {
  var
    result = [],
    numBlocks = buffer.readUInt32BE(8);

  for (var i = 0; i < numBlocks; i++) {
    offset += readBlock(buffer, offset, result);
  }

  return result;
}

function readBlock(buffer, offset, result) {
  var
    nameLength, name,
    type = buffer.readUInt16BE(offset),
    blockLength = buffer.readUInt32BE(offset + 2);

  switch (type) {
    case ASE_BLOCK_TYPE_COLOR:
      result.push(readColorEntry(buffer, offset + 6));
      break;
    case ASE_BLOCK_TYPE_GROUP_START:
      result.push(readGroupStart(buffer, offset + 6));
      break;
    case ASE_BLOCK_TYPE_GROUP_END:
      result.push(readGroupEnd(buffer, offset + 6, result));
      break;
    default:
      throw new Error('Unsupported type ' + type.toString(16) + ' at offset ' + offset);
  }

  return 6 + blockLength;
}

function readColorEntry(buffer, offset) {
  var nameLength = buffer.readUInt16BE(offset);

  return {
    type: 'color',
    name: readUTF16BE(buffer, offset + 2, nameLength),
    color: readColor(buffer, offset + 2 + nameLength * 2)
  };
}

function readColor(buffer, offset) {
  var model = buffer.toString('utf8', offset, offset + 4).trim();

  switch (model) {
    case 'RGB':
      return {
        model: model,
        r: buffer.readFloatBE(offset + 4),
        g: buffer.readFloatBE(offset + 8),
        b: buffer.readFloatBE(offset + 12),
        type: ASE_COLOR_TYPES[buffer.readUInt16BE(offset + 16)]
      };
    case 'CMYK':
      return {
        model: model,
        c: buffer.readFloatBE(offset + 4),
        m: buffer.readFloatBE(offset + 8),
        y: buffer.readFloatBE(offset + 12),
        k: buffer.readFloatBE(offset + 16),
        type: ASE_COLOR_TYPES[buffer.readUInt16BE(offset + 20)]
      };
    case 'Gray':
      return {
        model: model,
        gray: buffer.readFloatBE(offset + 4),
        type: ASE_COLOR_TYPES[buffer.readUInt16BE(offset + 8)]
      };
    case 'LAB':
      return {
        model: model,
        lightness: buffer.readFloatBE(offset + 4),
        a: buffer.readFloatBE(offset + 8),
        b: buffer.readFloatBE(offset + 12),
        type: ASE_COLOR_TYPES[buffer.readUInt16BE(offset + 16)]
      };
    default:
      throw new Error('Unsupported color model: ' + model + ' at offset ' + offset);
  }
}

function readGroupStart(buffer, offset) {
  var nameLength = buffer.readUInt16BE(offset);
  return {
    type: 'group-start',
    name: readUTF16BE(buffer, offset + 2, nameLength)
  };
}

function readGroupEnd(buffer, offset) {
  return {type: 'group-end'};
}

function readUTF16BE(buffer, offset, length){
  return iconv.decode(buffer.slice(offset, offset + (length - 1) * 2), 'utf16be');
}

function createGroups(accumulated, item) {
  var last = accumulated[accumulated.length - 1];
  if (last && last.type === 'group-start') {
    if (item.type === 'group-end') {
      last.type = 'group';
    } else {
      last.entries.push(item);
    }
  } else if (item.type === 'group-start') {
    item.entries = [];
    accumulated.push(item);
  } else {
    accumulated.push(item);
  }
  return accumulated;
}
