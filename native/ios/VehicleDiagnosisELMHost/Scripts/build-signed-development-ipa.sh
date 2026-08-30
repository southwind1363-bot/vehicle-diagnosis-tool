#!/bin/bash
set -euo pipefail

bundle_id="com.mukiguri.VehicleDiagnosisELMHost"
required_variables=(
  IOS_DEVELOPMENT_CERTIFICATE_P12_BASE64
  IOS_DEVELOPMENT_CERTIFICATE_PASSWORD
  IOS_DEVELOPMENT_PROVISIONING_PROFILE_BASE64
  SIGNING_OUTPUT_DIR
  GITHUB_SHA
  GITHUB_RUN_NUMBER
  RUNNER_TEMP
)

for variable_name in "${required_variables[@]}"; do
  if [[ -z "${!variable_name:-}" ]]; then
    echo "::error title=Missing iOS signing input::$variable_name is not configured"
    exit 1
  fi
done

temp_root="$(mktemp -d "$RUNNER_TEMP/vehicle-diagnosis-ios-signing.XXXXXX")"
keychain_path="$temp_root/signing.keychain-db"
installed_profile=""

cleanup() {
  if [[ -n "$installed_profile" ]]; then
    rm -f "$installed_profile"
  fi
  security delete-keychain "$keychain_path" >/dev/null 2>&1 || true
  rm -rf "$temp_root"
}
trap cleanup EXIT

certificate_path="$temp_root/development-certificate.p12"
profile_path="$temp_root/development.mobileprovision"
profile_plist="$temp_root/development-profile.plist"
profile_summary="$temp_root/profile-summary.json"
app_entitlements="$temp_root/app-entitlements.plist"
embedded_profile_plist="$temp_root/embedded-profile.plist"

printf '%s' "$IOS_DEVELOPMENT_CERTIFICATE_P12_BASE64" | /usr/bin/base64 -D > "$certificate_path"
printf '%s' "$IOS_DEVELOPMENT_PROVISIONING_PROFILE_BASE64" | /usr/bin/base64 -D > "$profile_path"
test -s "$certificate_path"
test -s "$profile_path"

keychain_password="$(openssl rand -hex 32)"
security create-keychain -p "$keychain_password" "$keychain_path"
security set-keychain-settings -lut 21600 "$keychain_path"
security unlock-keychain -p "$keychain_password" "$keychain_path"
security import "$certificate_path" -k "$keychain_path" -P "$IOS_DEVELOPMENT_CERTIFICATE_PASSWORD" -T /usr/bin/codesign -T /usr/bin/security >/dev/null
security set-key-partition-list -S apple-tool:,apple: -s -k "$keychain_password" "$keychain_path" >/dev/null

identity_sha="$(security find-identity -v -p codesigning "$keychain_path" | awk '$2 ~ /^[[:xdigit:]]+$/ && length($2) == 40 {print $2; exit}')"
if [[ -z "$identity_sha" ]]; then
  echo "::error title=Development certificate unavailable::No valid code-signing identity was imported"
  exit 1
fi

security cms -D -i "$profile_path" > "$profile_plist"
python3 - "$profile_plist" "$profile_summary" "$bundle_id" <<'PY'
import datetime
import json
import plistlib
import sys

profile_path, summary_path, bundle_id = sys.argv[1:]
with open(profile_path, "rb") as source:
    profile = plistlib.load(source)

team_ids = profile.get("TeamIdentifier") or []
entitlements = profile.get("Entitlements") or {}
application_identifier = entitlements.get("application-identifier", "")
expiration = profile.get("ExpirationDate")
devices = profile.get("ProvisionedDevices") or []

if len(team_ids) != 1 or not team_ids[0]:
    raise SystemExit("Provisioning profile must contain exactly one TeamIdentifier")
expected_identifier = f"{team_ids[0]}.{bundle_id}"
if application_identifier != expected_identifier:
    raise SystemExit("Provisioning profile application identifier does not exactly match the host bundle identifier")
if entitlements.get("get-task-allow") is not True:
    raise SystemExit("Provisioning profile is not an iOS development profile")
if not devices:
    raise SystemExit("Provisioning profile has no registered iPhone devices")
if not isinstance(expiration, datetime.datetime):
    raise SystemExit("Provisioning profile expiration is missing")
now = datetime.datetime.now(datetime.timezone.utc)
if expiration.tzinfo is None:
    expiration = expiration.replace(tzinfo=datetime.timezone.utc)
if expiration <= now + datetime.timedelta(days=1):
    raise SystemExit("Provisioning profile is expired or expires within 24 hours")

summary = {
    "uuid": profile.get("UUID", ""),
    "name": profile.get("Name", ""),
    "team_id": team_ids[0],
    "expiration": expiration.isoformat(),
}
if not summary["uuid"] or not summary["name"]:
    raise SystemExit("Provisioning profile UUID or name is missing")
with open(summary_path, "w", encoding="utf-8") as destination:
    json.dump(summary, destination)
PY

profile_uuid="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["uuid"])' "$profile_summary")"
profile_name="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["name"])' "$profile_summary")"
team_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["team_id"])' "$profile_summary")"
profile_expiration="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["expiration"])' "$profile_summary")"

profile_directory="$HOME/Library/MobileDevice/Provisioning Profiles"
mkdir -p "$profile_directory"
installed_profile="$profile_directory/$profile_uuid.mobileprovision"
cp "$profile_path" "$installed_profile"

derived_data="$temp_root/DerivedData"
rm -rf "$SIGNING_OUTPUT_DIR"
mkdir -p "$SIGNING_OUTPUT_DIR"

xcodebuild \
  -project VehicleDiagnosisELMHost.xcodeproj \
  -scheme VehicleDiagnosisELMHost \
  -configuration Release \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -derivedDataPath "$derived_data" \
  CODE_SIGN_STYLE=Manual \
  CODE_SIGNING_ALLOWED=YES \
  CODE_SIGNING_REQUIRED=YES \
  CODE_SIGN_IDENTITY="$identity_sha" \
  DEVELOPMENT_TEAM="$team_id" \
  PROVISIONING_PROFILE_SPECIFIER="$profile_uuid" \
  OTHER_CODE_SIGN_FLAGS="--keychain $keychain_path" \
  build

app_path="$derived_data/Build/Products/Release-iphoneos/VehicleDiagnosisELMHost.app"
test -d "$app_path"
test -d "$app_path/_CodeSignature"
test -s "$app_path/embedded.mobileprovision"
test "$(plutil -extract CFBundleIdentifier raw -o - "$app_path/Info.plist")" = "$bundle_id"
codesign --verify --deep --strict --verbose=2 "$app_path"
codesign -dv --verbose=4 "$app_path" 2>&1 | grep -Fq "TeamIdentifier=$team_id"
codesign -d --entitlements :- "$app_path" > "$app_entitlements" 2>/dev/null
test "$(plutil -extract application-identifier raw -o - "$app_entitlements")" = "$team_id.$bundle_id"
test "$(plutil -extract get-task-allow raw -o - "$app_entitlements")" = "true"

security cms -D -i "$app_path/embedded.mobileprovision" > "$embedded_profile_plist"
test "$(plutil -extract UUID raw -o - "$embedded_profile_plist")" = "$profile_uuid"
test "$(plutil -extract Entitlements.application-identifier raw -o - "$embedded_profile_plist")" = "$team_id.$bundle_id"

short_sha="${GITHUB_SHA:0:12}"
ipa_name="VehicleDiagnosisELMHost-signed-development-${short_sha}-${GITHUB_RUN_NUMBER}.ipa"
package_root="$temp_root/package"
verify_root="$temp_root/verify"
mkdir -p "$package_root/Payload" "$verify_root"
ditto "$app_path" "$package_root/Payload/VehicleDiagnosisELMHost.app"
(cd "$package_root" && zip -qry -y "$SIGNING_OUTPUT_DIR/$ipa_name" Payload)
unzip -q "$SIGNING_OUTPUT_DIR/$ipa_name" -d "$verify_root"

verified_app="$verify_root/Payload/VehicleDiagnosisELMHost.app"
test -d "$verified_app/_CodeSignature"
test -s "$verified_app/embedded.mobileprovision"
codesign --verify --deep --strict --verbose=2 "$verified_app"
test "$(plutil -extract CFBundleIdentifier raw -o - "$verified_app/Info.plist")" = "$bundle_id"

(
  cd "$SIGNING_OUTPUT_DIR"
  shasum -a 256 "$ipa_name" > "$ipa_name.sha256"
  shasum -a 256 --check "$ipa_name.sha256"
)
ipa_sha="$(shasum -a 256 "$SIGNING_OUTPUT_DIR/$ipa_name" | awk '{print $1}')"
export IPA_NAME="$ipa_name" IPA_SHA="$ipa_sha" PROFILE_EXPIRATION="$profile_expiration"
python3 - <<'PY'
import json
import os
import pathlib

manifest = {
    "schema_version": "ios_signed_development_build_v1",
    "artifact": os.environ["IPA_NAME"],
    "bundle_id": "com.mukiguri.VehicleDiagnosisELMHost",
    "commit_sha": os.environ["GITHUB_SHA"],
    "run_number": int(os.environ["GITHUB_RUN_NUMBER"]),
    "sha256": os.environ["IPA_SHA"],
    "profile_expiration": os.environ["PROFILE_EXPIRATION"],
    "signed": True,
    "installability_scope": "registered_devices_in_embedded_development_profile",
    "target_device_installation_verified": False,
    "read_only": True,
    "vehicle_command_enabled": False,
}
path = pathlib.Path(os.environ["SIGNING_OUTPUT_DIR"], "signed-development-build.json")
path.write_text(json.dumps(manifest, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
PY

echo "Signed development IPA verified for the registered devices in the embedded profile."
