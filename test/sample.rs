// This is a test Rust file with some imports

// This is an incorrect multi-line import
use crate::example::{
    One,
    Two,
    Three
};

// These are correct imports
use std::collections::HashMap;
use std::path::Path;

// This is another incorrect multi-line import
use std::sync::{
    Arc, Mutex,
    RwLock
};

// This is a correct import with multiple items
use std::io::Error, Result;

fn main() {
    // This is a very long line that will exceed the 110 character limit to test the line width check functionality of our GitHub Action
    let very_long_variable_name = "This string is intentionally long to trigger the line width check in our GitHub Action implementation";

    println!("Hello, world!");
}