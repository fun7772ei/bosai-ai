"""Read GGUF metadata with the Python standard library; never load tensor weights."""
import json, struct, sys

def inspect(path):
    with open(path, 'rb') as stream:
        assert stream.read(4) == b'GGUF', 'Not GGUF'
        version, tensors, count = struct.unpack('<IQQ', stream.read(20))
        def string(keep=True):
            length = struct.unpack('<Q', stream.read(8))[0]
            if not keep:
                stream.seek(length, 1)
                return None
            return stream.read(length).decode()
        def value(kind, keep=True):
            formats = {0:'B', 1:'b', 2:'H', 3:'h', 4:'I', 5:'i', 6:'f', 7:'?', 10:'Q', 11:'q', 12:'d'}
            if kind in formats:
                fmt = '<' + formats[kind]
                return struct.unpack(fmt, stream.read(struct.calcsize(fmt)))[0]
            if kind == 8:
                return string(keep)
            if kind == 9:
                subtype, length = struct.unpack('<IQ', stream.read(12))
                result = [value(subtype, keep and length <= 64) for _ in range(length)]
                return result if keep and length <= 64 else {'arrayLength': length}
            raise ValueError(kind)
        metadata = {}
        for _ in range(count):
            key = string()
            kind = struct.unpack('<I', stream.read(4))[0]
            keep = key not in ['tokenizer.ggml.tokens', 'tokenizer.ggml.merges', 'tokenizer.ggml.scores', 'tokenizer.ggml.token_type']
            data = value(kind, keep)
            if keep:
                metadata[key] = data
        return {'version': version, 'tensorCount': tensors, 'metadata': metadata}

if __name__ == '__main__':
    print(json.dumps(inspect(sys.argv[1]), ensure_ascii=False, indent=2))
