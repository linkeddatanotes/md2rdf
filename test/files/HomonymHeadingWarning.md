# Homonym example

If the same heading and this is used twice in the same file, it is a Homonym. The RDF resources then merge. Md2Rdf will issue a HomonymHeadingWarning.

# Project: Gardening

## Tools
```turtle
this: a :GardenToolsList.
```

# Project Biking

### Tools
The same heading used twice, also with different level. How dare you 😱! 
The parser will only return md2rdf metadata for the first heading.
```turtle
this: a :BikerepairToolsList.
```
