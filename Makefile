.DEFAULT_GOAL := all
.SILENT:

SHELL := /bin/bash

.PHONY: all build clean apple-mail outlook encrypt .check-mac

all: build


##
# Generates the `dist` folder used to build the GitHub Pages site.
#
build: clean
	mkdir -p dist/img
	mkdir -p dist/installers

	cp src/installers/* dist/installers
	chmod -x dist/installers/*

	# TODO


##
# Remove artifacts from the build process.
clean:
	rm -rf dist


##
# Install the email signatures on macOS Apple Mail from the local repository's configuration.
#
apple-mail: .check-mac
	./src/installers/macos.sh --local apple-mail


##
# Install the signatures on macOS Microsoft Outlook from the local repository's configuration.
#
outlook: .check-mac
	./src/installers/macos.sh --local outlook


##
# Encrypts provided text for use within templates.
#
encrypt:
	if ! command -v openssl >/dev/null 2>&1; then \
		echo "OpenSSL is not installed. Cannot continue."; \
		exit 1; \
	fi

	read -s -p "Password: " PASSWORD; \
	echo; \
	read -s -p "Confirm Password: " PASSWORD_CONFIRM; \
	echo; \
	if [ "$${PASSWORD}" != "$${PASSWORD_CONFIRM}" ]; then \
		echo "ERROR: Passwords did not match."; \
		exit 1; \
	fi; \
	echo; \
	echo "Type or paste your encrypted text here. Press CTL+D when finished to encrypt:"; \
	echo; \
	ENC_MSG=""; \
	while IFS= read -r -n 1 CHAR; do \
		ORD=$$(LC_CTYPE=C printf '%d' "'$${CHAR}"); \
		case $${ORD} in \
			4) break ;; \
			0) ENC_MSG="$${ENC_MSG}\n" ;; \
			92) ENC_MSG="$${ENC_MSG}\\\\" ;; \
			*) ENC_MSG="$${ENC_MSG}$${CHAR}" ;; \
		esac; \
	done; \
	echo; \
	echo "---"; \
	echo; \
	openssl aes-256-cbc -e -base64 -A -pbkdf2 -salt -pass "pass:$${PASSWORD}" -in <(echo -e "$${ENC_MSG}"); \
	echo; \
	echo;


##
# Check if this user is running on macOS
#
.check-mac:
	if [ "$$(uname -s)" != "Darwin" ]; then \
		echo "This target is only designed to run on macOS platforms."; \
		exit 1; \
	fi
