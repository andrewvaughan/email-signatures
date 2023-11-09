#!/usr/bin/env node

const crypto = require("crypto");
const fse = require("fs-extra");
const glob = require("glob-promise");
const { promisify } = require("util");

/**
 * Email Signature Builder.
 *
 * @classdesc
 * Compiles the signatures and places them in the `dist` folder. Handles all relative-URL replacement and deciphering of
 * encrypted text.
 *
 * This module may be called directly or from a GitHub Action runner.
 *
 * @author Andrew Vaughan <hello@andrewvaughan.io>
 * @license MIT
 *
 * @class
 */
class Builder {
  /**
   * The header used to identify this class' ciphers.
   *
   * @protected @static @type {String}
   */
  static _CIPHER_HEADER = "$EMAIL-SIG-CIPHER$";

  /**
   * How many rounds to perform when encrypting data.
   *
   * The higher the number, the longer it takes, but the more secure the final result.
   *
   * @protected @static @type {Number}
   */
  static _CIPHER_ITERATIONS = 100000;

  /**
   * The length, in bytes, to use for the salt.
   *
   * @protected @static @type {Number}
   */
  static _CIPHER_SALT_LEN = 12;

  /**
   * Generate the email signatures in the provided directory.
   *
   * @param {String} destPath - the directory to build into
   * @param {String} urlBase - the URL base to use for turning relative paths to absolute paths
   * @param {String} [cipherKey=undefined] - an optional key, or password, to any ciphered text in the signatures
   *
   * @returns {Promise} that resovles when the build has completed
   *
   * @public @static @async
   */
  static async build(destPath, urlBase, cipherKey = undefined) {
    console.log(`Building email signatures in directory: ${destPath}`);

    // Make the distribution directory
    console.log("Creating destination directory...");

    return (
      fse
        .ensureDir(destPath)

        // Copy the file structure from the signatures folder over to the distribution folder
        .then(async function copyFiles() {
          console.log("Copying template files to destination directory...");

          return fse.copy(`${__dirname}/signatures/`, destPath);
        })

        // Get our signature files
        .then(async function getSignatures() {
          console.log("Identifiy signature files...");

          return glob(`${destPath}/*.html`);
        })

        // Load the files as strings
        .then(async function loadFileData(files) {
          console.log("Loading files into memory...");

          if (!Array.isArray(files)) {
            throw TypeError("Expected files to be an Array.");
          }

          if (files.length <= 0) {
            throw Error("No signature files found.");
          }

          let fileData = {};

          files.forEach((file) => {
            console.log(`    Loading ${file}...`);

            fileData[file] = fse.readFileSync(file, "utf8");
          });

          return fileData;
        })

        // Parse relative URLs and apply the provided url base to make them absolute
        .then(async function relativeToAbsoluteURLs(fileData) {
          console.log(`Converting relative URLs to absolute URLs with domain base: ${urlBase}`);

          let absData = {};

          for (const [file, data] of Object.entries(fileData)) {
            console.log(`    Parsing file ${file}...`);

            absData[file] = data.replace(/src(?:\s+)?=(?:\s+)?("|')(?!http|\/)/gi, `src=$1${urlBase}/`);
          }

          return absData;
        })

        // Decipher any text strings in the files with the provided key, if any
        .then(async function decipherText(fileData) {
          console.log("Checking signature files for ciphers...");

          let ciphers = [];
          let promises = [];

          for (const [file, data] of Object.entries(fileData)) {
            console.log(`    Deciphering file ${file}...`);

            const matches = data.match(/{e{.+}e}/gi);

            if (!matches) {
              console.log(`        No cipher strings found.`);
              continue;
            }

            if (!cipherKey) {
              throw new Error("Cipher strings found, but no decipher key provided.");
            }

            matches.forEach((match) => {
              const cipher = match.replace(/{e{|}e}/gi, "");

              console.log(`        Parsing cipher ${cipher.substring(0, cipher.length > 20 ? 20 : length)}...`);

              ciphers.push(match);
              promises.push(Builder.decipher(cipherKey, cipher));
            });
          }

          return Promise.all([fileData, ciphers, Promise.all(promises)]);
        })

        // Replace the ciphers with their plaintext
        .then(async function replaceCiphers([fileData, ciphers, plainTexts]) {
          console.log("Replacing ciphers with plaintext...");

          let promises = [];

          for (let [filename, content] of Object.entries(fileData)) {
            console.log(`    Updating file ${filename}...`);

            for (let i = 0; i < ciphers.length; i++) {
              const cipher = ciphers[i];
              const plainText = plainTexts[i].trim();

              content = content.replaceAll(cipher, plainText);
            }

            promises.push(fse.writeFile(filename, content));
          }

          return Promise.all(promises);
        })
    );
  }

  /**
   * Encipher given data using a provided password.
   *
   * This uses AES256 encryption with CBC mode. Keys are generated using PBKDF2 from the password.
   *
   * @param {String} password - the password to use for the cipher
   * @param {String} plainText - the data to encipher
   *
   * @returns {String} a Base64-encoded string contianing the cipher package
   *
   * @public @static @async
   */
  static async encipher(password, plainText) {
    return (
      // Genreate a random salt for the encipherment
      promisify(crypto.randomBytes)(this._CIPHER_SALT_LEN)

        // Convert the salt to base64
        .then(function base64Salt(salt) {
          return salt.toString("base64");
        })

        // Derive the password and HMAC keys from the password and salt
        .then(function deriveKeysFromPassword(salt) {
          return Promise.all([
            salt,

            // Generate a random, 128-bit initialization vector
            promisify(crypto.randomBytes)(16),

            // Derive a key from the password and salt combination
            Builder._deriveEncryptKeysFromPassword(password, salt, Builder._CIPHER_ITERATIONS),
          ]);
        })

        // Encrypt the content with the AES256 cipher in CBC mode
        .then(function encryptData([salt, rawIV, derivedKeys]) {
          const iv = Buffer.from(rawIV);
          const hexIV = iv.toString("hex");

          // Encrypt our data from UTF-8 to an encrypted Base64
          const cipher = crypto.createCipheriv("aes-256-cbc", derivedKeys.key, iv);

          let encrypted = cipher.update(plainText, "utf-8", "base64");
          encrypted += cipher.final("base64");

          // Generate an HMAC for authentication
          const hmac = crypto.createHmac("sha256", derivedKeys.hmac);

          hmac.update(encrypted);
          hmac.update(hexIV);
          hmac.update(salt);

          const hexHMAC = hmac.digest("hex");

          // Package all these contents into a cipher to output
          const pkg = [
            1, // Version
            salt, // Salt
            hexIV, // Initialization vector
            Builder._CIPHER_ITERATIONS, // Rounds
            hexHMAC, // HMAC digest
            encrypted, // Data
          ];

          return Builder._CIPHER_HEADER + Buffer.from(JSON.stringify(pkg, null, 0)).toString("base64");
        })
    );
  }

  /**
   * Decipher given data using a provided password.
   *
   * This uses AES256 encryption with CBC mode. Keys are generated using PBKDF2 from the password.
   *
   * @param {String} password - the password to use with the cipher
   * @param {String} cryptText - the data to decipher
   *
   * @returns {String} the deciphered text
   *
   * @throws {TypeError} if an unidentified cipher is provided
   *
   * @public @static @async
   */
  static async decipher(password, cryptText) {
    if (!cryptText.startsWith(Builder._CIPHER_HEADER)) {
      throw TypeError("Ciphered text missing cipher header.");
    }

    // Parse our JSON from the Base64 after removing the header
    const [version, salt, hexIV, rounds, hmacDigest, encrypted] = JSON.parse(
      Buffer.from(cryptText.slice(Builder._CIPHER_HEADER.length), "base64").toString("ascii"),
    );

    if (version != 1) {
      throw TypeError(`Unexpected cipher version: ${version}`);
    }

    return (
      // Get our keys using the provided password and the cipher package
      Builder._deriveEncryptKeysFromPassword(password, salt, rounds)
        // Decipher the provided data using the derived keys
        .then(function decipherFromKeys(derivedKeys) {
          const iv = Buffer.from(hexIV, "hex");

          // Authenticate the package using the HMAC
          const hmac = crypto.createHmac("sha256", derivedKeys.hmac);

          hmac.update(encrypted);
          hmac.update(hexIV);
          hmac.update(salt);

          const hmacBuffer = Buffer.from(hmacDigest);
          const hmacCheck = Buffer.from(hmac.digest("hex"));

          /**
           * Perform a constant-time comparison between two values. This is important to prevent timing attacks.
           *
           * @see {@link http://codahale.com/a-lesson-in-timing-attacks/}
           * @see {@link https://github.com/nodejs/node-v0.x-archive/issues/8560}
           */
          if (!crypto.timingSafeEqual(hmacBuffer, hmacCheck)) {
            throw new Error("HMAC authentication failed while deciphering data.");
          }

          // Decrypt the data
          const decipher = crypto.createDecipheriv("aes-256-cbc", derivedKeys.key, iv);
          const plainText = decipher.update(encrypted, "base64", "utf-8");

          return `${plainText}${decipher.final("utf-8")}`;
        })
    );
  }

  /**
   * Generates encryption keys given password and salt information.
   *
   * This uses the PBKDF2 algorithm to generate a key and Hashed Message Authentication Code (HMAC) for cipering and
   * decipering text. This allows encryption to use normal text passwords.
   *
   * @param {String} password - the password to generate the keys from
   * @param {String} salt - a binary string of bytes containing the salt
   * @param {Number} [rounds = Builder._ENCRYPT_SALT_LENGTH] - the number of iterations to use in key generation
   *
   * @returns {Object<String, Buffer>} - containing the `key` and `hmac` generated, in hexidecimal, as Buffers
   *
   * @protected @static @async
   */
  static async _deriveEncryptKeysFromPassword(password, salt, rounds = Builder._CIPHER_ITERATIONS) {
    return (
      // 512-bits are necessary to create two 256-bit keys for the password and HMAC
      promisify(crypto.pbkdf2)(password, salt, rounds, 64, "sha512")

        // Create key buffers and return
        .then(function createBuffers(derivedKey) {
          const hexKey = derivedKey.toString("hex");
          const keyLen = hexKey.length;

          return {
            // First 256-bits are dedicated to the key
            key: Buffer.from(hexKey.substring(0, keyLen / 2), "hex"),

            // Last 256-bits are dedicated to the Key-Hashed Message Authentication Code
            hmac: Buffer.from(hexKey.substring(keyLen / 2, keyLen), "hex"),
          };
        })
    );
  }
}

module.exports = Builder;

/**
 * Logic for running script directly
 */
if (typeof require !== "undefined" && require.main === module) {
  const { program } = require("commander");

  // Parse command-line arguments
  program
    .name("Builder.js")
    .description("Email signature builder. Converts templates to usable HTML.")
    .version("0.1.0");

  program
    .option("-u, --urlBase <url>", "The base URL for the templates", "https://signatures.andrewvaughan.io")
    .option("-d, --dist <directory>", "The distribution build directory to output to", `${process.cwd()}/dist`)
    .option("-p, --password <password>", "An optional password for encrypted text in the signatures")
    .option(
      "-e, --encrypt <file>",
      "Encrypt the provided file data with the given password and exit. Requires --password.",
    );

  program.parse();

  const options = program.opts();

  // If encrypting, simply encrypt and return
  if (options.encrypt) {
    if (!options.password) {
      throw new ReferenceError("Expected `--password` option to be set to encrypt value.");
    }

    console.log("Enciphering...\n");

    fse
      .readFile(options.encrypt)
      .then((content) => {
        return Builder.encipher(options.password, content);
      })

      // Decipher again for a validation check
      .then((encrypted) => {
        console.log(`{e{${encrypted}}e}`);
      });

    return;
  }

  // Otherwise, run the builder
  Builder.build(options.dist, options.urlBase, options.password).catch((err) => {
    console.error("FAILURE! Removing partial distribution directory.");

    fse.removeSync(options.dist);

    throw err;
  });
}
