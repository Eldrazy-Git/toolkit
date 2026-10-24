"""{{nom}}

Script en cours de création par Claude.
"""

import argparse
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description="{{nom}}")
    parser.parse_args()
    print("Bonjour depuis {{nom}} !")
    return 0


if __name__ == "__main__":
    sys.exit(main())
