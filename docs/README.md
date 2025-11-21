# Documentation

This directory contains all technical documentation for the Astribot Navigation UI project.

## Essential Documentation

### Core System Documentation
- **[NAVIGATION_EVENTS.md](./NAVIGATION_EVENTS.md)** - Navigation result/feedback/status event handling (CRITICAL)
- **[TASK_SYSTEM.md](./TASK_SYSTEM.md)** - Extensible task architecture and adding new task types
- **[VISUAL_TASK_FLOW_EDITOR.md](./VISUAL_TASK_FLOW_EDITOR.md)** - Visual flow editor usage guide
- **[ROS_INTEGRATION.md](./ROS_INTEGRATION.md)** - ROS backend integration and interfaces
- **[LOCALIZATION_SERVICES.md](./LOCALIZATION_SERVICES.md)** - Localization service API reference
- **[MAP_STORAGE_ARCHITECTURE.md](./MAP_STORAGE_ARCHITECTURE.md)** - Map storage architecture

### Quick Start Guides
- **[QUICKSTART.md](./QUICKSTART.md)** - Project quick start guide
- **[QUICKSTART_FLOW_EDITOR.md](./QUICKSTART_FLOW_EDITOR.md)** - Visual flow editor quick start
- **[TASK_QUICKSTART.md](./TASK_QUICKSTART.md)** - Task system quick start

### Usage Guides
- **[TASK_USAGE_GUIDE.md](./TASK_USAGE_GUIDE.md)** - Task system usage examples
- **[STARTUP_SCRIPTS.md](./STARTUP_SCRIPTS.md)** - Startup scripts documentation
- **[MOCK_NAVIGATION.md](./MOCK_NAVIGATION.md)** - Mock navigation server guide

### Testing & Development
- **[TASK_TESTING_GUIDE.md](./TASK_TESTING_GUIDE.md)** - Task system testing guide
- **[TEST_REPORT.md](./TEST_REPORT.md)** - Test reports
- **[VISUAL_TASK_EDITOR_RESEARCH.md](./VISUAL_TASK_EDITOR_RESEARCH.md)** - Visual editor research notes

### Implementation Details
- **[TASK_DRAG_DROP.md](./TASK_DRAG_DROP.md)** - Drag and drop implementation
- **[TASK_DRAG_IMPLEMENTATION.md](./TASK_DRAG_IMPLEMENTATION.md)** - Drag implementation details
- **[TASK_UI_WORKFLOW.md](./TASK_UI_WORKFLOW.md)** - Task UI workflow
- **[COMPLETE_TASK_SYSTEM.md](./COMPLETE_TASK_SYSTEM.md)** - Complete task system overview

### Bug Fixes & Updates
- **[BUGFIX_FLOW_EDITOR.md](./BUGFIX_FLOW_EDITOR.md)** - Flow editor bug fixes
- **[TASK_REFACTORING_SUMMARY.md](./TASK_REFACTORING_SUMMARY.md)** - Task refactoring summary
- **[UPDATE_SUMMARY.md](./UPDATE_SUMMARY.md)** - General update summary
- **[CHANGELOG.md](./CHANGELOG.md)** - Project changelog

## Documentation Structure

```
docs/
├── README.md                          # This file
├── NAVIGATION_EVENTS.md              # Navigation system (CRITICAL)
├── TASK_SYSTEM.md                    # Task architecture
├── VISUAL_TASK_FLOW_EDITOR.md        # Visual editor
├── ROS_INTEGRATION.md                # ROS integration
├── LOCALIZATION_SERVICES.md          # Localization API
├── MAP_STORAGE_ARCHITECTURE.md       # Map storage
├── QUICKSTART.md                     # Quick starts
├── STARTUP_SCRIPTS.md                # Scripts
├── MOCK_NAVIGATION.md                # Mock server
├── TASK_USAGE_GUIDE.md               # Usage guides
├── TASK_TESTING_GUIDE.md             # Testing
└── ...                               # Other docs
```

## For New Developers

Start with these documents in order:

1. **[QUICKSTART.md](./QUICKSTART.md)** - Get the project running
2. **[ROS_INTEGRATION.md](./ROS_INTEGRATION.md)** - Understand ROS communication
3. **[NAVIGATION_EVENTS.md](./NAVIGATION_EVENTS.md)** - Critical navigation concepts
4. **[TASK_SYSTEM.md](./TASK_SYSTEM.md)** - Extensible task architecture
5. **[VISUAL_TASK_FLOW_EDITOR.md](./VISUAL_TASK_FLOW_EDITOR.md)** - Visual programming interface

## Contributing

When adding new features or documentation:
- Update relevant documentation files
- Add cross-references to related documents
- Update this README if adding new documentation
