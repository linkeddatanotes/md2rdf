```ttl
<> a :Document; 
 :author "Leo Sauermann".
```

# First heading
```turtle
this: :relatedto <http://www.example.com>.
```
A sentence.

## Lunch Meeting
A meeting, no date and time in heading.

```turtle
this: a :Meeting;
  :attendee <#Bob>.
```

Additions to the attendees:

```turtle
this: :attendee <https://example.com/user/Alice>.
```

# Bob
```turtle
this: a foaf:Person;
  foaf:nick "Bob".
```