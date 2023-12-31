#!/usr/bin/env bash

##
# macOS email signature installation script.
#
# Designed to be ran locally from a Repository or remotely from GitHub Pages generated site. Run with the `-h` command
# for usage instructions.
#
# @see {@link https://github.com/andrewvaughan/email-signatures}
#

if [[ "$(uname)" != "Darwin" ]]; then
  echo "This script may only be run on macOS."
  exit 1
fi

##
# The remote server that GitHub Pages builds to.
#
REMOTE_HOST="https://signatures.andrewvaughan.io"

# Cause a glob with no results to result in empty output, rather than to evaluate back to itself.
shopt -s nullglob

##
# Print the usage instructions and exit.
#
usage() {
  echo "Usage: $0 [-hl] [outlook|apple-mail]"
  echo
  echo "This utility installs generated signatures into the target mail client. This"
  echo "script only runs on macOS."
  echo
  echo "For more detail, visit:"
  echo
  echo "    https://github.com/andrewvaughan/email-signatures"
  echo
  echo "Options:"
  echo
  echo "  -h, --help     Print this usage guide."
  echo "  -l, --local    Use local repository signatures instead of downloading."
  echo

  exit
}

##
# Prepares local files or
prepare_files() {
  echo
  echo "Preparing signature files..."
  echo

  # If this is in local mode, build signatures locally and set our distribution folder within the Repository
  if [[ SIG_IS_LOCAL -gt 0 ]]; then
    echo "Building signatures locally..."

    echo
    echo "Installing dependencies..."
    make dependencies

    echo
    echo "Building from signature templates..."
    echo
    echo "You will be asked for a cipher password. If your signature files do not contain"
    echo "ciphers, you can press 'Enter' to bypass this request."
    echo

    if ! make build; then
      echo "Build failed. Exiting."
      exit 4
    fi

    SIGS=( $(pwd)/dist/signatures/*.html )

  # Otherwise, load them remotely via the signature list and create a temporary distribution folder
  else
    local SIG_FILE
    local SIG_LIST
    local WORK_DIR

    echo "Downloading signature list from ${REMOTE_HOST}..."

    # Check for the `jq` utility
    if ! command -v jq >/dev/null 2>&1; then
      echo
      echo "ERROR: Processing remote signatures requires the 'jq' utility. Please install:"
      echo
      echo "    https://jqlang.github.io/jq/download/"
      echo

      exit 8
    fi

    echo
    SIG_FILE=$(curl --progress-bar -f -L -A "Email Signature Installer/1.0" "${REMOTE_HOST}/signatures.json")

    if [[ -z "${SIG_FILE}" ]]; then
      echo
      echo "    ERROR: Unable to load remote signatures file from ${REMOTE_HOST}/signatures.json"

      exit 7
    fi

    SIG_LIST=$(echo "${SIG_FILE}" | jq -r ".[]")

    # echo
    # echo "    ${SIG_COUNT} signature files to download identified."

    echo
    echo "Creating working directory..."

    WORK_DIR="$(mktemp -d)"

    echo
    echo "Downloading signature files..."

    SIGS=()

    for SIG in $SIG_LIST; do
      echo
      echo "    Downloading ${SIG}..."

      TARGET="${WORK_DIR}/$(basename "${SIG}")"

      echo
      curl --progress-bar -f -L -A "Email Signature Installer/1.0" -o "${TARGET}" "${SIG}"
      echo "${TARGET}"

      if [[ $? -ne 0 ]]; then
        echo "Failed."
        exit 9
      fi

      SIGS+=( "${TARGET}" )
    done
  fi
}

install_apple() {
  echo
  echo "Installing signatures on Apple Mail client..."

  echo
  echo "    Scanning for Apple Mail version..."

  local AMAIL_SIG_DIR

  # Search versions of Apple Mail in reverse order
  for AMAIL_VERSION in 5 4 3 2 1; do
    local AMAIL_ICLOUD="${HOME}/Library/Mobile Documents/com~apple~mail/Data/V${AMAIL_VERSION}/Signatures"
    local AMAIL_NON_ICLOUD="${HOME}/Library/Mail/V${AMAIL_VERSION}/MailData/Signatures"

    # Check if the iCloud version exists
    if [ -d "${AMAIL_ICLOUD}" ]; then
      AMAIL_SIG_DIR="${AMAIL_ICLOUD}"
      break
    fi

    # Check if the non-iCloud version exists
    if [ -d "${AMAIL_NON_ICLOUD}" ]; then
      AMAIL_SIG_DIR="${AMAIL_NON_ICLOUD}"
      break
    fi
  done

  if [ -z "${AMAIL_SIG_DIR}" ]; then
    echo
    echo "        Unable to locate Apple Mail library folder."
    exit 5
  fi

  echo
  echo "    Quitting Apple Mail..."

  osascript <<END
    tell application "Mail"
      quit
    end tell
END

  # OSAScript really sucks for Apple Mail, so this is done manually
  for SIG_TPL_FILE in "${SIGS[@]}"; do
    local FILENAME
    local NAME
    local UUID
    local TARGET

    FILENAME=$(basename "${SIG_TPL_FILE}")

    # Remove the extension
    NAME="${FILENAME%.*}"

    # Convert underscores to spaces
    NAME="${NAME//_/ }"

    echo
    echo "    Installing '${NAME}' on Apple Mail..."

    UUID="$(uuidgen)"
    TARGET="${AMAIL_SIG_DIR}/${UUID}.mailsignature"

    echo
    echo "        Writing signature file..."

    # Add headers and the template to the signature file
    {
      printf "Content-Transfer: 7bit\n"
      printf "Content-Type: text/html;\n"
      printf "        charset=utf-8\n"
      printf "Message-Id: <%s>\n" "${UUID}"
      printf "Mime-Version: 1.0 (Mac OS X Mail 16.0 \(3731.700.6\))\n\n"
      cat "${SIG_TPL_FILE}"
    } >> "${TARGET}"

    # Load the `AllSignatures.plist` XML
    echo
    echo "        Updating plist..."

    /usr/libexec/PlistBuddy -c "Add :0 dict" "${AMAIL_SIG_DIR}/AllSignatures.plist"
    /usr/libexec/PlistBuddy -c "Add :0:SignatureIsRich bool true" "${AMAIL_SIG_DIR}/AllSignatures.plist"
    /usr/libexec/PlistBuddy -c "Add :0:SignatureName string '${NAME}'" "${AMAIL_SIG_DIR}/AllSignatures.plist"
    /usr/libexec/PlistBuddy -c "Add :0:SignatureUniqueId string '${UUID}'" "${AMAIL_SIG_DIR}/AllSignatures.plist"
  done

  echo
  echo "Restarting Apple Mail..."

  osascript <<END
    tell application "Mail"
      activate
    end tell
END
}

install_outlook() {
  echo
  echo "Installing signatures on Outlook client..."

  for SIG_TPL_FILE in "${SIGS[@]}"; do
    local NAME

    NAME=$(basename "${SIG_TPL_FILE}")

    # Remove the extension
    NAME="${NAME%.*}"

    # Convert underscores to spaces
    NAME="${NAME//_/ }"

    echo
    echo "    Installing '${NAME}' on Outlook..."
    echo

    osascript <<END
      set sigName to "${NAME}"
      set sigContent to (read ("${SIG_TPL_FILE}"))

      tell application id "com.microsoft.Outlook"
        make new signature with properties {name:sigName, content:sigContent}
      end tell
END
  done
}

## ---------------------------------------------------------------------------------------------------------------------

SIG_CLIENT=""
SIG_IS_LOCAL=0

# Parse the provided arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -h|--help)
      usage
      ;;

    -l|--local)
      SIG_IS_LOCAL=1
      shift
      ;;

    -*|--*)
      echo "Unknown option $1"
      exit 2
      ;;

    *)
      SIG_CLIENT="$1"
      shift
      ;;
  esac
done

# If no client was provided, show the help
if [[ "${SIG_CLIENT}" == "" ]]; then
  usage
fi


# Run the appropriate install logic
case $SIG_CLIENT in
  apple-mail)
    prepare_files
    install_apple
    ;;

  outlook)
    prepare_files
    install_outlook
    ;;

  *)
    echo "Unknown mail client '${SIG_CLIENT}'."
    exit 3
esac
