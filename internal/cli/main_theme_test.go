package cli

import (
	"image/color"
	"reflect"
	"testing"

	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/fang"
)

func TestBrandUsesAppColorScheme(t *testing.T) {
	tests := []struct {
		name   string
		isDark bool
		want   fang.ColorScheme
	}{
		{
			name: "light",
			want: fang.ColorScheme{
				Base:           lipgloss.Color("#09090b"),
				Title:          lipgloss.Color("#18181b"),
				Description:    lipgloss.Color("#09090b"),
				Codeblock:      lipgloss.Color("#f4f4f5"),
				Program:        lipgloss.Color("#18181b"),
				DimmedArgument: lipgloss.Color("#71717b"),
				Comment:        lipgloss.Color("#71717b"),
				Flag:           lipgloss.Color("#18181b"),
				FlagDefault:    lipgloss.Color("#71717b"),
				Command:        lipgloss.Color("#18181b"),
				QuotedString:   lipgloss.Color("#18181b"),
				Argument:       lipgloss.Color("#09090b"),
				Help:           lipgloss.Color("#71717b"),
				Dash:           lipgloss.Color("#71717b"),
				ErrorHeader: [2]color.Color{
					lipgloss.Color("#fef2f2"),
					lipgloss.Color("#e7000b"),
				},
				ErrorDetails: lipgloss.Color("#e7000b"),
			},
		},
		{
			name:   "dark",
			isDark: true,
			want: fang.ColorScheme{
				Base:           lipgloss.Color("#fafafa"),
				Title:          lipgloss.Color("#fafafa"),
				Description:    lipgloss.Color("#fafafa"),
				Codeblock:      lipgloss.Color("#18181b"),
				Program:        lipgloss.Color("#fafafa"),
				DimmedArgument: lipgloss.Color("#9f9fa9"),
				Comment:        lipgloss.Color("#9f9fa9"),
				Flag:           lipgloss.Color("#fafafa"),
				FlagDefault:    lipgloss.Color("#9f9fa9"),
				Command:        lipgloss.Color("#fafafa"),
				QuotedString:   lipgloss.Color("#fafafa"),
				Argument:       lipgloss.Color("#fafafa"),
				Help:           lipgloss.Color("#9f9fa9"),
				Dash:           lipgloss.Color("#9f9fa9"),
				ErrorHeader: [2]color.Color{
					lipgloss.Color("#ffffff"),
					lipgloss.Color("#c10007"),
				},
				ErrorDetails: lipgloss.Color("#c10007"),
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := brand(lipgloss.LightDark(tt.isDark))
			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("brand() = %#v, want %#v", got, tt.want)
			}
		})
	}
}
