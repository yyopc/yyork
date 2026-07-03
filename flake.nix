{
  description = "yyork local agent orchestrator";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      nixpkgs,
      flake-utils,
      ...
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
        lib = pkgs.lib;
        go = pkgs.go_1_25;
        packageJSON = builtins.fromJSON (builtins.readFile ./package.json);
        version = packageJSON.version;
        releaseTag = "v${version}";
        nativeArtifacts = {
          aarch64-darwin = {
            target = "darwin-arm64";
            hash = "sha256-nsqDk7tb+jbKEIxpkPXmBU/q41kVzgIddOyDzjCJiNA=";
          };
          x86_64-darwin = {
            target = "darwin-x64";
            hash = "sha256-Zbx0/StYxfER6kBqpDuIsw4i4JoVnZ6mChfUSXa+Mns=";
          };
          aarch64-linux = {
            target = "linux-arm64";
            hash = "sha256-1xKVRajfoG84z/LVvUHmhuKV0pIwqmvDqF7tpZU31yw=";
          };
          x86_64-linux = {
            target = "linux-x64";
            hash = "sha256-no4A0IRGBbjg8N3eNFf6pYlnXk2G2IaGh3N7uaQ6j8A=";
          };
        };
        nativeArtifact =
          nativeArtifacts.${system}
            or (throw "yyork does not publish a native release artifact for ${system}");
        nativeTarball = "yyopc-yyork-${nativeArtifact.target}-${version}.tgz";
        yyork = pkgs.stdenvNoCC.mkDerivation {
          pname = "yyork";
          inherit version;

          src = pkgs.fetchurl {
            url = "https://github.com/yyopc/yyork/releases/download/${releaseTag}/${nativeTarball}";
            hash = nativeArtifact.hash;
          };

          sourceRoot = "package";
          dontBuild = true;

          installPhase = ''
            runHook preInstall

            install -Dm755 bin/yyork "$out/bin/yyork"
            install -Dm755 bin/zellij "$out/libexec/yyork/bin/zellij"
            install -Dm644 LICENSE "$out/share/licenses/yyork/LICENSE"
            install -Dm644 README.md "$out/share/doc/yyork/README.md"
            install -Dm644 THIRD_PARTY_NOTICES.md "$out/share/doc/yyork/THIRD_PARTY_NOTICES.md"

            runHook postInstall
          '';

          passthru = {
            releaseAsset = nativeTarball;
          };

          meta = {
            description = "Local app for supervising multiple AI coding agents at once";
            homepage = "https://github.com/yyopc/yyork";
            license = {
              shortName = "YYOIT";
              fullName = "YYOIT License";
              url = "https://github.com/yyopc/yyork/blob/${releaseTag}/LICENSE";
            };
            mainProgram = "yyork";
            platforms = builtins.attrNames nativeArtifacts;
          };
        };
        yyorkDev = pkgs.writeShellApplication {
          name = "yyork";
          runtimeInputs = [
            pkgs.coreutils
            go
          ];
          text = ''
            root="$PWD"
            while [ "$root" != "/" ] && { [ ! -f "$root/go.mod" ] || [ ! -f "$root/main.go" ]; }; do
              root="$(dirname "$root")"
            done

            if [ ! -f "$root/go.mod" ] || [ ! -f "$root/main.go" ]; then
              echo "Unable to find the yyork source root."
              exit 1
            fi

            cd "$root"
            exec go run . "$@"
          '';
        };
        portlessDev = pkgs.writeShellApplication {
          name = "portless";
          runtimeInputs = [
            pkgs.coreutils
            pkgs.pnpm_10
          ];
          text = ''
            root="$PWD"
            while [ "$root" != "/" ] && [ ! -f "$root/pnpm-workspace.yaml" ]; do
              root="$(dirname "$root")"
            done

            if [ ! -f "$root/pnpm-workspace.yaml" ]; then
              echo "Unable to find the yyork workspace root."
              exit 1
            fi

            if [ ! -x "$root/node_modules/.bin/portless" ]; then
              echo "portless is not installed; run 'pnpm install' first."
              exit 1
            fi

            cd "$root"
            exec "$root/node_modules/.bin/portless" "$@"
          '';
        };
      in
      {
        packages = {
          default = yyork;
          yyork = yyork;
        };

        apps = {
          default = flake-utils.lib.mkApp { drv = yyork; };
          yyork = flake-utils.lib.mkApp { drv = yyork; };
        };

        devShells.default = pkgs.mkShell {
          buildInputs = [
            yyorkDev
            portlessDev
            go
            pkgs.goreleaser
            pkgs.nodejs_24
            pkgs.pnpm_10
          ];

          shellHook = ''
            export GOROOT="${go}/share/go"
            export GOPATH="$PWD/.go"
            export GOBIN="$PWD/go-bin"
            export PNPM_HOME="$PWD/.pnpm"
            export PATH="$GOBIN:$PNPM_HOME:$PATH"
          '';
        };
      }
    );
}
