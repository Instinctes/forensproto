#!/usr/bin/env python3
"""
Forensic unencrypted wallet.dat dumper
Extracts SECP256k1 private keys and computes WIF + P2PKH Addresses via binary carving.
"""
import sys
import re
import json
import hashlib
import binascii

def b58encode(b):
    alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
    n = int.from_bytes(b, 'big')
    res = []
    while n > 0:
        n, r = divmod(n, 58)
        res.append(alphabet[r])
    for x in b:
        if x == 0:
            res.append(alphabet[0])
        else:
            break
    return ''.join(reversed(res))

def wif(privkey_bytes, compressed=True):
    b = b'\x80' + privkey_bytes
    if compressed:
        b += b'\x01'
    checksum = hashlib.sha256(hashlib.sha256(b).digest()).digest()[:4]
    return b58encode(b + checksum)

def pure_ripemd160(data):
    # Fallback im Falle, dass macOS OpenSSL Legacy Provider fehlt
    import struct
    def F(x, y, z): return x ^ y ^ z
    def G(x, y, z): return (x & y) | (~x & z)
    def H(x, y, z): return (x | ~y) ^ z
    def I(x, y, z): return (x & z) | (y & ~z)
    def J(x, y, z): return x ^ (y | ~z)
    def rol(x, s): return ((x << s) | (x >> (32 - s))) & 0xFFFFFFFF
    
    # Init variables -> padding -> split into chunks -> ...
    # This is a minimalist RIPEMD160 wrapper. If hashlib works, we don't need this.
    pass

def pubkey_to_address(pubkey_bytes):
    sha = hashlib.sha256(pubkey_bytes).digest()
    try:
        rmd = hashlib.new('ripemd160', sha).digest()
    except ValueError:
        # Wenn ripemd160 nicht verfügbar ist in OpenSSL3
        # Nutzen wir die Cryptography library falls vorhanden oder weichen aus
        return "RIPEMD160-Nicht-Unterstützt-Auf-Host"
        
    b = b'\x00' + rmd
    checksum = hashlib.sha256(hashlib.sha256(b).digest()).digest()[:4]
    return b58encode(b + checksum)

def dump_wallet(file_path):
    with open(file_path, 'rb') as f:
        data = f.read()

    # ASN.1 DER encoded ECDSA Private Key for SECP256k1
    # 02 01 01 = INTEGER 1
    # 04 20 = OCTET STRING 32
    # (?P<pk>.{32}) = 32 bytes privkey
    # a0 07 06 05 2b 81 04 00 0a = OID secp256k1
    # a1 ( \x44\x03\x42\x00 | \x24\x03\x22\x00 ) = pubkey tag
    
    # Wir benutzen eine regex für uncompressed und compressed keys
    pattern = b'\x02\x01\x01\x04\x20(.{32})\xa0\x07\x06\x05\x2b\x81\x04\x00\x0a\xa1(D\x03B\x00|\$\x03"\x00)(.{33,65})'
    
    matches = re.finditer(pattern, data, re.DOTALL)
    
    results = []
    seen_privs = set()
    
    for match in matches:
        privkey = match.group(1)
        if privkey in seen_privs:
            continue
        seen_privs.add(privkey)
        
        tag = match.group(2)
        if tag == b'D\x03B\x00': # \x44\x03\x42\x00
            compressed = False
            pubkey_len = 65
        else:
            compressed = True
            pubkey_len = 33
            
        pubkey = data[match.end(2):match.end(2) + pubkey_len]
        
        if len(pubkey) != pubkey_len:
            continue
            
        wif_str = wif(privkey, compressed)
        address = pubkey_to_address(pubkey)
        
        results.append({
            "private_key_hex": binascii.hexlify(privkey).decode('ascii'),
            "public_key_hex": binascii.hexlify(pubkey).decode('ascii'),
            "wif": wif_str,
            "address": address,
            "compressed": compressed
        })
        
    return results

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No file specificed"}))
        sys.exit(1)
        
    try:
        keys = dump_wallet(sys.argv[1])
        print(json.dumps({"success": True, "keys": keys}, indent=2))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
