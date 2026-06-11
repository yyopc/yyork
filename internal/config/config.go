package config

import (
	"errors"
	"os"
	"path/filepath"

	"github.com/spf13/viper"
)

const (
	configDirName  = ".yyork"
	configFileName = "config"
	configFileType = "yaml"
)

// Config is the user-facing yyork configuration loaded from
// ~/.yyork/config.yaml.
type Config struct {
	Agents map[string]AgentConfig `mapstructure:"agents"`
}

// AgentConfig contains values from one agent's config section. Agent plugins
// own validation for their custom keys.
type AgentConfig map[string]any

// Load reads ~/.yyork/config.yaml. A missing file returns an empty config.
func Load() (Config, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return Config{}, err
	}

	v := viper.New()
	v.SetConfigName(configFileName)
	v.SetConfigType(configFileType)
	v.AddConfigPath(filepath.Join(homeDir, configDirName))

	return load(v)
}

// LoadFile reads a specific config file path. A missing file returns an empty
// config, matching Load.
func LoadFile(path string) (Config, error) {
	v := viper.New()
	v.SetConfigFile(path)
	v.SetConfigType(configFileType)

	return load(v)
}

func load(v *viper.Viper) (Config, error) {
	if err := v.ReadInConfig(); err != nil {
		var notFound viper.ConfigFileNotFoundError
		if errors.As(err, &notFound) {
			return emptyConfig(), nil
		}
		if os.IsNotExist(err) {
			return emptyConfig(), nil
		}
		return Config{}, err
	}

	cfg := emptyConfig()
	if err := v.Unmarshal(&cfg); err != nil {
		return Config{}, err
	}
	if cfg.Agents == nil {
		cfg.Agents = map[string]AgentConfig{}
	}

	return cfg, nil
}

func emptyConfig() Config {
	return Config{
		Agents: map[string]AgentConfig{},
	}
}
