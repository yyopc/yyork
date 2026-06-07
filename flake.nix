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
        go = pkgs.go_1_25;
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
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = [
            yyorkDev
            go
            pkgs.nodejs_22
            pkgs.pnpm_10
            pkgs.just
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
