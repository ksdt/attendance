var spinitron = require('spinitron-spinpapi');
var moment = require('moment');
var express = require('express');
var mustache = require('mustache');
var fs = require('fs');

spinitron = new spinitron({
    station: 'ksdt',
    userid: process.env['SPIN_USER'],
    secret: process.env['SPIN_SECRET']
});

var app = express();

app.use(express.static('static'));


var cachedRender;
var cacheTime;

app.get('/', function (req, res) {

    if (cachedRender && moment(cacheTime).add(60, 'minutes').isAfter(moment())) {
        console.log("cached");
        res.send(cachedRender);
        return;
    }

    var weeks = [];

    var beginningOfThisWeek = moment().startOf('week');

    weeks.push({ start: moment(beginningOfThisWeek)} );

    for (var i = 0; i < 12; i++) {
        weeks.push({ start: moment(beginningOfThisWeek.subtract(1, 'week')) });
    }

    weeks.forEach(function (week, i) {
        weeks[i].weekstr = 
            "Week of " + week.start.format('MMM D');
    });

    var grid = fs.readFileSync('./grid.html', 'utf-8');

    spinitron.getRegularShowsInfo({}, function(err, resp) {

        var shows = resp.results;

        function getPlaylistsForShow(show) {
            return new Promise(function (resolve, reject) {
                spinitron.getPlaylistsInfo( { ShowID: show['ShowID'], Num : 99 }, function (err, resp) {
                    if (err) reject(err);
                    else resolve(resp.results ? resp.results : []);
                });
            });
        }

        var playlistsPromises = [];

        shows.forEach(function (show) {
            show.weeks = new Array(weeks.length);
            for (var i = 0; i < weeks.length; i++)
                show.weeks[i] = {};
            playlistsPromises.push(new Promise(function (resolve, reject) {
                getPlaylistsForShow(show).then(function(playlists) {
                    show.playlists = playlists && playlists.length ? playlists : [];
                }).then(resolve).catch(reject);
            }));
        });

        Promise.all(playlistsPromises).then(function() {
            shows.forEach(function (show) {
                show.weeks.forEach(function (week, i) {
                    show.playlists.forEach(function (playlist) {
                        if (moment(playlist['PlaylistDate']).isBetween(weeks[i].start, moment(weeks[i].start).add(1, 'week'))) {
                            week.here = 'here';
                            week.link = 'https://spinitron.com/radio/playlist.php?station=ksdt&playlist='+playlist['PlaylistID'];
                        }
                    });
                }); 
            });
        }).then(function() {
            cachedRender = mustache.render(grid, { weekns: weeks, shows: shows });
            cacheTime = moment();
            res.send(cachedRender);
        }).catch(function(err) {
            console.log(err);
            res.send('sorry, there was an error.');
        });
    });
});


app.listen(process.env.PORT || 3000);
