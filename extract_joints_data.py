#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# -----------------------------------------------------------------------------
# Copyright (c) 2024, Astribot Co., Ltd.
# All rights reserved.
# License: BSD 3-Clause License
# -----------------------------------------------------------------------------
# Author: Astribot Team
# -----------------------------------------------------------------------------

"""
File: extract_joints_data.py
Brief: Extract joint data from HDF5 file to another HDF5 file.

Usage:
    python3 extract_joints_data.py <input_hdf5> <output_hdf5>
"""

import os
import sys
import h5py


def extract_joints_data(input_path, output_path):
    """Extract time and joints_position_command from input HDF5 to output HDF5."""

    with h5py.File(input_path, 'r') as f_in:
        with h5py.File(output_path, 'w') as f_out:
            # Copy time data
            if 'time' in f_in:
                f_out.create_dataset('time', data=f_in['time'][()])
                print(f"Copied 'time': {f_in['time'].shape}")

            # Copy joints_position_command under joints_dict group (match 208-traj_replay.py structure)
            if 'joints_dict' in f_in and 'joints_position_command' in f_in['joints_dict']:
                data = f_in['joints_dict']['joints_position_command'][()]
                joints_group = f_out.create_group('joints_dict')
                joints_group.create_dataset('joints_position_command', data=data)
                print(f"Copied 'joints_dict/joints_position_command': {data.shape}")
                print(f"First frame joint positions: {data[0]}")
            else:
                print("Warning: joints_position_command not found in input file")

    print(f"\nSuccessfully extracted data to: {output_path}")


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print("Usage: python3 extract_joints_data.py <input_hdf5> <output_hdf5>")
        print("\nExample:")
        print("  python3 extract_joints_data.py /home/instellar/Downloads/0402_Open_the_door_4_episode_35.hdf5 extracted_joints.hdf5")
        sys.exit(1)

    input_hdf5 = sys.argv[1]
    output_hdf5 = sys.argv[2]

    if not os.path.exists(input_hdf5):
        print(f"Error: Input file not found: {input_hdf5}")
        sys.exit(1)

    print(f"Input file: {input_hdf5}")
    print(f"Output file: {output_hdf5}")
    print("-" * 50)

    extract_joints_data(input_hdf5, output_hdf5)