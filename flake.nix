{
  description = "yyork local agent orchestrator development shell";

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
        src = lib.cleanSourceWith {
          src = ./.;
          filter =
            path: _type:
            let
              rel = lib.removePrefix ((toString ./.) + "/") (toString path);
            in
            !(lib.hasPrefix ".git/" rel)
            && !(lib.hasPrefix ".direnv/" rel)
            && !(lib.hasPrefix ".go/" rel)
            && !(lib.hasPrefix ".pnpm/" rel)
            && !(lib.hasPrefix "dist/" rel)
            && !(lib.hasPrefix "node_modules/" rel)
            && !(lib.hasPrefix "internal/web/build/" rel)
            && !(lib.hasPrefix "internal/web/node_modules/" rel)
            && rel != "yyork";
        };
        yyork = pkgs.writeShellApplication {
          name = "yyork";
          runtimeInputs = [
            go
            pkgs.git
            pkgs.zellij
          ];
          text = ''
            export YYORK_ZELLIJ="${pkgs.zellij}/bin/zellij"
            export GOWORK=off
            cd ${src}
            exec go run . "$@"
          '';
        };
        yyorkDev = pkgs.writeShellApplication {
          name = "yyork";
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

            cd "$root"
            exec pnpm dev "$@"
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
            export GOBIN="$GOPATH/bin"
            export PNPM_HOME="$PWD/.pnpm"
            export PATH="$GOBIN:$PNPM_HOME:$PATH"
          '';
        };
      }
    );
}
