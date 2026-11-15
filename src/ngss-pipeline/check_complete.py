"""Check standards-ai/ngss.json against the published NGSS structure: 208 performance expectations.

usage: python3 check_complete.py <ngss.json>
Prints every expected code that is missing, and any unexpected extra.
"""
import sys, json

# Number of performance expectations under each band + core idea, as published in the NGSS.
EXPECTED = {
    'K': {'PS2': 2, 'PS3': 2, 'LS1': 1, 'ESS2': 2, 'ESS3': 3},
    '1': {'PS4': 4, 'LS1': 2, 'LS3': 1, 'ESS1': 2},
    '2': {'PS1': 4, 'LS2': 2, 'LS4': 1, 'ESS1': 1, 'ESS2': 3},
    'K-2': {'ETS1': 3},
    '3': {'PS2': 4, 'LS1': 1, 'LS2': 1, 'LS3': 2, 'LS4': 4, 'ESS2': 2, 'ESS3': 1},
    '4': {'PS3': 4, 'PS4': 3, 'LS1': 2, 'ESS1': 1, 'ESS2': 2, 'ESS3': 2},
    '5': {'PS1': 4, 'PS2': 1, 'PS3': 1, 'LS1': 1, 'LS2': 1, 'ESS1': 2, 'ESS2': 2, 'ESS3': 1},
    '3-5': {'ETS1': 3},
    'MS': {'PS1': 6, 'PS2': 5, 'PS3': 5, 'PS4': 3, 'LS1': 8, 'LS2': 5, 'LS3': 2, 'LS4': 6,
           'ESS1': 4, 'ESS2': 6, 'ESS3': 5, 'ETS1': 4},
    'HS': {'PS1': 8, 'PS2': 6, 'PS3': 5, 'PS4': 5, 'LS1': 7, 'LS2': 8, 'LS3': 3, 'LS4': 6,
           'ESS1': 6, 'ESS2': 7, 'ESS3': 6, 'ETS1': 4},
}
want = {f'{band}-{dci}-{n}' for band, dcis in EXPECTED.items() for dci, k in dcis.items() for n in range(1, k + 1)}
have = {p['c'] for p in json.load(open(sys.argv[1]))['pe']}
print('expected', len(want), 'have', len(have))
print('missing:', sorted(want - have) or 'none')
print('extra:', sorted(have - want) or 'none')
