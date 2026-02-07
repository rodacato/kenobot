## Weather Skill

When asked about weather, follow these steps:

1. Extract the location from the user's message
   - If no location specified, ask for one
   - Accept city names, countries, or "here" (ask for city if ambiguous)

2. Use the `web_fetch` tool to get weather data:
   - Fetch `https://wttr.in/{location}?format=j1` for JSON weather data
   - Fallback: `https://wttr.in/{location}?format=3` for a one-line summary

3. Present the response in this format:
   Currently in [Location]: [temp]°C, [conditions]
   Feels like: [feelslike]°C | Humidity: [humidity]% | Wind: [wind] km/h
   [Brief forecast for next hours if available]

Keep it concise. People just want the basics.
